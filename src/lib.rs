//! The Typst compiler behind a small `wasm-bindgen` API.
//!
//! The host owns all I/O: it hands in project files, package files and extra
//! fonts as bytes, and the compiler never touches a network or a file system.

mod diagnostic;
mod options;
mod query;
mod time;
mod world;

use std::num::NonZeroUsize;
use std::str::FromStr;

use typst::diag::{SourceDiagnostic, SourceResult, Warned};
use typst::ecow::EcoVec;
use typst::engine::Sink;
use typst::foundations::Content;
use typst::syntax::package::PackageSpec;
use typst::syntax::{FileId, VirtualRoot};
use typst_layout::PagedDocument;
use wasm_bindgen::prelude::*;

pub use diagnostic::Diagnostic;
use diagnostic::detached_error;
pub use options::{Inputs, PdfOptions, QueryOptions, SvgOptions};
use options::{bytes_argument, string_argument};
use query::{evaluate, select_elements};
use world::{InMemoryWorld, Overrides, file_id};

/// Compilations whose memoized results are older than this many runs are evicted.
const CACHE_MAX_AGE: usize = 10;

/// A Typst compiler with its own in-memory project.
// @jsfi/typst-cli's declarations are generated from these doc comments, so they describe what both
// packages do; this one's memoization is in its README.
#[wasm_bindgen]
pub struct Compiler {
    world: InMemoryWorld,
}

#[wasm_bindgen]
impl Compiler {
    /// Creates a compiler with an empty project. It knows the fonts given to `addFont`.
    /// One of @jsfi/typst-cli also knows the typst program's embedded fonts, unless `init()` was
    /// given `ignoreEmbeddedFonts`.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Compiler {
        Compiler {
            world: InMemoryWorld::new(),
        }
    }

    /// Adds every face of a TrueType, OpenType or collection font file.
    /// Returns how many faces were added.
    #[wasm_bindgen(js_name = addFont)]
    pub fn add_font(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "Uint8Array")] data: JsValue,
    ) -> Result<usize, JsError> {
        Ok(self.world.add_font(bytes_argument(&data, "data")?))
    }

    /// Adds or replaces a project file, such as `/main.typ` or `/images/logo.png`.
    /// In @jsfi/typst-cli, which writes the project to disk to compile it, a compilation throws for
    /// files the file system cannot hold side by side, such as `/a` beside `/a/b.txt`.
    #[wasm_bindgen(js_name = addFile)]
    pub fn add_file(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "string")] path: JsValue,
        #[wasm_bindgen(unchecked_param_type = "Uint8Array")] data: JsValue,
    ) -> Result<(), JsError> {
        let path = string_argument(&path, "path")?;
        let data = bytes_argument(&data, "data")?;
        self.world
            .insert(file_id(VirtualRoot::Project, &path)?, data);
        Ok(())
    }

    /// Adds a file of a package, for example `("@preview/cetz:0.4.2", "/src/lib.typ", …)`.
    /// The package's `typst.toml` has to be added as well. The package @jsfi/typst-cli writes its
    /// files to disk as `addFile` describes.
    #[wasm_bindgen(js_name = addPackageFile)]
    pub fn add_package_file(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "string")] spec: JsValue,
        #[wasm_bindgen(unchecked_param_type = "string")] path: JsValue,
        #[wasm_bindgen(unchecked_param_type = "Uint8Array")] data: JsValue,
    ) -> Result<(), JsError> {
        let spec = string_argument(&spec, "spec")?;
        let path = string_argument(&path, "path")?;
        let data = bytes_argument(&data, "data")?;
        let spec = PackageSpec::from_str(&spec).map_err(|error| JsError::new(&error))?;
        self.world
            .insert(file_id(VirtualRoot::Package(spec), &path)?, data);
        Ok(())
    }

    /// Removes a project file. Returns whether it existed.
    #[wasm_bindgen(js_name = removeFile)]
    pub fn remove_file(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "string")] path: JsValue,
    ) -> Result<bool, JsError> {
        Ok(self.world.remove(project_file_id(&path)?))
    }

    /// Sets the project file compilation starts from.
    #[wasm_bindgen(js_name = setMain)]
    pub fn set_main(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "string")] path: JsValue,
    ) -> Result<(), JsError> {
        self.world.set_main(project_file_id(&path)?);
        Ok(())
    }

    /// Sets what the document sees as `sys.inputs`, replacing earlier inputs. Keys and values are
    /// trimmed, as the CLI's `--input key=value` trims them.
    #[wasm_bindgen(js_name = setInputs)]
    pub fn set_inputs(&mut self, inputs: Inputs) -> Result<(), JsError> {
        self.world.set_inputs(inputs.read()?);
        Ok(())
    }

    /// Compiles the main file to a PDF.
    #[wasm_bindgen(js_name = compilePdf)]
    pub fn compile_pdf(&mut self, options: Option<PdfOptions>) -> Result<CompileResult, JsError> {
        let settings = options::settings(options.as_ref(), PdfOptions::read)?;
        let mut diagnostics: Vec<Diagnostic> = settings.pages_warning().into_iter().collect();
        let standards = match settings.pdf_standards() {
            Ok(standards) => standards,
            Err(refusal) => {
                // A refused combination still reports what a compilation would have warned about.
                let diagnostics = self.world.in_module_order(diagnostics, [refusal]);
                return Ok(CompileResult::pdf(None, diagnostics));
            }
        };
        let pdf_options = typst_pdf::PdfOptions {
            timestamp: time::pdf_timestamp(settings.timestamp),
            tagged: settings.tagged(),
            page_ranges: settings.pages,
            standards,
            ..typst_pdf::PdfOptions::default()
        };

        let overrides = Overrides {
            now: settings.timestamp,
            ..Overrides::default()
        };
        let (pdf, compiled) = self.compile(overrides, |_, document| {
            typst_pdf::pdf(document, &pdf_options).map(Exported::without_warnings)
        })?;
        diagnostics.extend(compiled);
        Ok(CompileResult::pdf(pdf, diagnostics))
    }

    /// Compiles the main file to one SVG string per page.
    #[wasm_bindgen(js_name = compileSvg)]
    pub fn compile_svg(&mut self, options: Option<SvgOptions>) -> Result<CompileResult, JsError> {
        let pages = options::settings(options.as_ref(), SvgOptions::pages)?;
        let (svg, diagnostics) = self.compile(Overrides::default(), |_, document| {
            let options = typst_svg::SvgOptions::default();
            let svg = document
                .pages()
                .iter()
                .enumerate()
                .filter(|(index, _)| {
                    pages.as_ref().is_none_or(|pages| {
                        pages.includes_page(
                            NonZeroUsize::new(index + 1).expect("pages count from one"),
                        )
                    })
                })
                .map(|(_, page)| typst_svg::svg(page, &options))
                .collect();
            Ok(Exported::without_warnings(svg))
        })?;
        Ok(CompileResult::svg(svg, diagnostics))
    }

    /// Compiles the main file and finds the elements `selector` matches, such as `heading`,
    /// `<label>` or `figure.where(kind: table)`, like the CLI's
    /// `typst eval 'query(<selector>)' --in main.typ`. The value is what that prints as JSON.
    #[wasm_bindgen]
    pub fn query(
        &mut self,
        #[wasm_bindgen(unchecked_param_type = "string")] selector: JsValue,
        options: Option<QueryOptions>,
    ) -> Result<QueryResult, JsError> {
        let selector = string_argument(&selector, "selector")?;
        let settings = options::settings(options.as_ref(), QueryOptions::read)?;
        let expression = format!("query({selector})");
        let overrides = Overrides {
            expression: Some(&expression),
            ..Overrides::default()
        };
        let (output, diagnostics) = self.compile(overrides, |world, document| {
            let mut sink = Sink::new();
            let value = evaluate(world, &expression, &mut sink, document)?;
            let elements = value
                .cast::<Vec<Content>>()
                .map_err(|error| detached_error(error.message().clone()))?;
            Ok(Exported {
                output: select_elements(elements, &settings)?,
                warnings: sink.warnings().into_iter().collect(),
            })
        })?;

        let value = match output {
            Some(json) => {
                js_sys::JSON::parse(&json).map_err(|_| JsError::new("query result is not JSON"))?
            }
            None => JsValue::UNDEFINED,
        };
        Ok(QueryResult { value, diagnostics })
    }
}

impl Default for Compiler {
    fn default() -> Self {
        Self::new()
    }
}

impl Compiler {
    /// Compiles the main file, with `overrides` set for this compilation only, and hands the world
    /// and the document to `export`.
    fn compile<T>(
        &mut self,
        overrides: Overrides,
        export: impl FnOnce(&InMemoryWorld, &PagedDocument) -> SourceResult<Exported<T>>,
    ) -> Result<(Option<T>, Vec<Diagnostic>), JsError> {
        self.world.prepare()?;
        Ok(self.world.with_overrides(overrides, |world| {
            let Warned { output, warnings } = typst::compile::<PagedDocument>(world);
            let mut warnings: Vec<SourceDiagnostic> = warnings.into_iter().collect();
            let output = output
                .and_then(|document| export(world, &document))
                .map(|exported| {
                    warnings.extend(exported.warnings);
                    exported.output
                });

            let (output, errors) = match output {
                Ok(output) => (Some(output), EcoVec::new()),
                Err(errors) => (None, errors),
            };
            let diagnostics = world.in_module_order(
                warnings
                    .iter()
                    .map(|warning| Diagnostic::located(world, warning)),
                errors.iter().map(|error| Diagnostic::located(world, error)),
            );

            typst::comemo::evict(CACHE_MAX_AGE);
            (output, diagnostics)
        }))
    }
}

/// What an export produced, and the warnings it gave on top of the compilation's.
struct Exported<T> {
    output: T,
    warnings: Vec<SourceDiagnostic>,
}

impl<T> Exported<T> {
    fn without_warnings(output: T) -> Self {
        Self {
            output,
            warnings: Vec::new(),
        }
    }
}

/// The id of the project file at `path`, which has to be a string. `addFile` checks its data
/// argument between the two, as the CLI package does, so it does not use this.
fn project_file_id(path: &JsValue) -> Result<FileId, JsError> {
    file_id(VirtualRoot::Project, &string_argument(path, "path")?)
}

/// The version of this package.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").into()
}

/// The outcome of one compilation: the output when it succeeded, and every
/// warning and error either way.
#[wasm_bindgen(getter_with_clone)]
pub struct CompileResult {
    /// The PDF, from `compilePdf` when it succeeded. A copy that owns its buffer, so it can be
    /// transferred to another thread.
    pub pdf: Option<Vec<u8>>,
    /// One SVG string per page, from `compileSvg` when it succeeded.
    pub svg: Option<Vec<String>>,
    /// Every warning and error, whether the compilation succeeded or not.
    pub diagnostics: Vec<Diagnostic>,
}

impl CompileResult {
    fn pdf(pdf: Option<Vec<u8>>, diagnostics: Vec<Diagnostic>) -> Self {
        Self {
            pdf,
            svg: None,
            diagnostics,
        }
    }

    fn svg(svg: Option<Vec<String>>, diagnostics: Vec<Diagnostic>) -> Self {
        Self {
            pdf: None,
            svg,
            diagnostics,
        }
    }
}

/// The outcome of a query: the value when the document compiled and the selector
/// matched as asked, and every warning and error either way.
#[wasm_bindgen(getter_with_clone)]
pub struct QueryResult {
    /// The matched elements (or their field) as JSON values; `undefined` on failure.
    pub value: JsValue,
    /// Every warning and error, whether the query succeeded or not.
    pub diagnostics: Vec<Diagnostic>,
}
