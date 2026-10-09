//! The project a compiler holds: its files, packages, fonts and inputs, as the `World` Typst
//! compiles from.

use std::collections::HashMap;
use std::sync::LazyLock;

use typst::diag::{FileError, FileResult, PackageError};
use typst::foundations::{Bytes, Datetime, Dict, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use wasm_bindgen::JsError;

use crate::diagnostic::Diagnostic;
use crate::time::{DateFields, timezone_offset};

/// The file a query's expression is evaluated as, named like the CLI's `typst eval` names it, so
/// that diagnostics point into it the same way. One id for all queries: ids are never freed.
pub static EXPRESSION_ID: LazyLock<FileId> = LazyLock::new(|| {
    FileId::unique(RootedPath::new(
        VirtualRoot::Project,
        VirtualPath::new("<input-expression>").expect("a valid virtual path"),
    ))
});

/// What one compilation overrides in the world: the current time, which a PDF's timestamp sets,
/// and the expression a query evaluates.
#[derive(Default)]
pub struct Overrides<'a> {
    pub now: Option<f64>,
    pub expression: Option<&'a str>,
}

pub struct InMemoryWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    files: HashMap<FileId, Bytes>,
    sources: HashMap<FileId, Source>,
    main: Option<FileId>,
    /// A fixed current time in milliseconds since 1970, set while a PDF with a timestamp compiles.
    now: Option<f64>,
    /// The expression a query evaluates, while it runs.
    expression: Option<Bytes>,
}

impl InMemoryWorld {
    pub fn new() -> Self {
        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::new()),
            fonts: Vec::new(),
            files: HashMap::new(),
            sources: HashMap::new(),
            main: None,
            now: None,
            expression: None,
        }
    }

    /// Adds or replaces a file, keeping a parsed source to reparse incrementally.
    pub fn insert(&mut self, id: FileId, data: Vec<u8>) {
        if let Some(source) = self.sources.get_mut(&id) {
            match std::str::from_utf8(&data) {
                Ok(text) => {
                    source.replace(text);
                }
                Err(_) => {
                    self.sources.remove(&id);
                }
            }
        }
        self.files.insert(id, Bytes::new(data));
    }

    /// Removes a file. Returns whether it existed.
    pub fn remove(&mut self, id: FileId) -> bool {
        self.sources.remove(&id);
        self.files.remove(&id).is_some()
    }

    /// Adds every face of a font file. Returns how many faces Typst accepted.
    pub fn add_font(&mut self, data: Vec<u8>) -> usize {
        let before = self.fonts.len();
        self.fonts.extend(Font::iter(Bytes::new(data)));
        self.book = LazyHash::new(FontBook::from_fonts(&self.fonts));
        self.fonts.len() - before
    }

    pub fn set_main(&mut self, id: FileId) {
        self.main = Some(id);
    }

    pub fn set_inputs(&mut self, inputs: Dict) {
        self.library = LazyHash::new(Library::builder().with_inputs(inputs).build());
    }

    /// Runs `run` with what `overrides` sets, for this call only.
    pub fn with_overrides<R>(&mut self, overrides: Overrides, run: impl FnOnce(&Self) -> R) -> R {
        self.now = overrides.now;
        self.expression = overrides
            .expression
            .map(|text| Bytes::from_string(text.to_owned()));
        let result = run(self);
        self.now = None;
        self.expression = None;
        result
    }

    /// Checks that a main file is set, and parses new sources, before a compilation.
    pub fn prepare(&mut self) -> Result<(), JsError> {
        if self.main.is_none() {
            return Err(JsError::new("No main file set; call setMain() first."));
        }
        let missing: Vec<FileId> = self
            .files
            .keys()
            .filter(|id| id.vpath().extension() == Some("typ") && !self.sources.contains_key(id))
            .copied()
            .collect();
        for id in missing {
            if let Ok(source) = self.source(id) {
                self.sources.insert(id, source);
            }
        }
        Ok(())
    }

    /// The `warnings`, then the no-fonts warning while no font is added, then the `errors`. Typst
    /// lays text out without a single font and reports nothing, so this warns instead.
    pub fn in_module_order(
        &self,
        warnings: impl IntoIterator<Item = Diagnostic>,
        errors: impl IntoIterator<Item = Diagnostic>,
    ) -> Vec<Diagnostic> {
        let no_fonts = self.fonts.is_empty().then(|| {
            Diagnostic::detached(
                typst::diag::Severity::Warning,
                "no fonts are loaded, so no text is rendered",
                vec!["load fonts with addFont(), for example Typst's defaults from fonts/".into()],
            )
        });
        warnings.into_iter().chain(no_fonts).chain(errors).collect()
    }
}

impl InMemoryWorld {
    /// Whether `id` names a directory: the root, or a directory the added files lie in, as the CLI
    /// finds them on disk.
    fn is_directory(&self, id: FileId) -> bool {
        let directory = slash_path(id);
        directory == "/"
            || self.files.keys().any(|file| {
                file.root() == id.root() && slash_path(*file).starts_with(&format!("{directory}/"))
            })
    }
}

/// A file as diagnostics name it: `/path` in the project, `@namespace/name:version/path` in a
/// package.
pub fn display_path(id: FileId) -> String {
    let path = slash_path(id);
    match id.root() {
        VirtualRoot::Package(spec) => format!("{spec}{path}"),
        VirtualRoot::Project => path,
    }
}

impl World for InMemoryWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main.expect("prepare() checks that a main file is set")
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some(source) = self.sources.get(&id) {
            return Ok(source.clone());
        }
        let bytes = self.file(id)?;
        let text = std::str::from_utf8(&bytes).map_err(|_| FileError::InvalidUtf8)?;
        Ok(Source::new(id, text.into()))
    }

    /// A missing file is not found where the CLI would have searched; a package of which no file
    /// was added is not found at all, as the CLI reports a package missing from its package path.
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == *EXPRESSION_ID
            && let Some(expression) = &self.expression
        {
            return Ok(expression.clone());
        }
        if let Some(bytes) = self.files.get(&id) {
            return Ok(bytes.clone());
        }
        Err(match id.root() {
            VirtualRoot::Package(spec)
                if !self.files.keys().any(|file| file.root() == id.root()) =>
            {
                FileError::Package(PackageError::NotFound(spec.clone()))
            }
            _ if self.is_directory(id) => FileError::IsDirectory,
            _ => FileError::NotFound(display_path(id).into()),
        })
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    /// Like the CLI: the local date, unless a fixed time is set, whose date is taken in UTC.
    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        let now = self.now.unwrap_or_else(js_sys::Date::now);
        let fields = match offset {
            None if self.now.is_none() => DateFields::local(now, timezone_offset(now)),
            None => DateFields::utc(now),
            Some(offset) => DateFields::utc(now + offset.seconds().trunc() * 1000.0),
        };
        fields.date()
    }
}

/// The path of a file inside its root, starting with `/`.
fn slash_path(id: FileId) -> String {
    id.vpath().get_with_slash().to_string()
}

/// The id of a file at `path` under `root`, failing as Typst's virtual paths fail.
pub fn file_id(root: VirtualRoot, path: &str) -> Result<FileId, JsError> {
    let vpath = VirtualPath::new(path).map_err(|error| JsError::new(&error.to_string()))?;
    Ok(RootedPath::new(root, vpath).intern())
}
