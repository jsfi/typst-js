//! Diagnostics as JavaScript sees them.

use typst::diag::{Severity, SourceDiagnostic};
use typst::ecow::{EcoString, EcoVec, eco_vec};
use typst::syntax::Span;
use typst::{World, WorldExt};
use wasm_bindgen::prelude::*;

use crate::world::{InMemoryWorld, display_path};

/// A warning or error, with its place in the document when it has one.
#[wasm_bindgen(getter_with_clone, inspectable)]
#[derive(Clone)]
pub struct Diagnostic {
    /// What `severity()` returns.
    severity: &'static str,
    /// What went wrong, as Typst words it.
    pub message: String,
    /// Suggestions on how to fix it.
    pub hints: Vec<String>,
    /// The file the diagnostic points into, packages prefixed with their spec.
    pub path: Option<String>,
    /// The byte offset in the file where the diagnostic starts.
    pub start: Option<usize>,
    /// The byte offset in the file where the diagnostic ends. For an error with an empty span that
    /// Typst's parser did not report, such as one in a malformed CSV file, @jsfi/typst-cli gives
    /// the end one character after the start, as the typst program draws it.
    pub end: Option<usize>,
    /// The one-based line of `start`.
    pub line: Option<usize>,
    /// The one-based column of `start`, in characters.
    pub column: Option<usize>,
}

#[wasm_bindgen]
impl Diagnostic {
    /// `"error"` or `"warning"`.
    #[wasm_bindgen(getter, unchecked_return_type = "'error' | 'warning'")]
    pub fn severity(&self) -> String {
        self.severity.into()
    }
}

impl Diagnostic {
    /// A diagnostic of Typst's with its place in `world`: the file, the byte range and the line and
    /// column it starts at.
    pub fn located(world: &InMemoryWorld, diagnostic: &SourceDiagnostic) -> Self {
        let id = diagnostic.span.id();
        let range = world.range(diagnostic.span);
        let (line, column) = match (id.and_then(|id| world.source(id).ok()), &range) {
            (Some(source), Some(range)) => {
                let lines = source.lines();
                (
                    lines.byte_to_line(range.start).map(|line| line + 1),
                    lines.byte_to_column(range.start).map(|column| column + 1),
                )
            }
            _ => (None, None),
        };
        Self {
            severity: Self::severity_name(diagnostic.severity),
            message: diagnostic.message.to_string(),
            hints: diagnostic
                .hints
                .iter()
                .map(|hint| hint.v.to_string())
                .collect(),
            path: id.map(display_path),
            start: range.as_ref().map(|range| range.start),
            end: range.as_ref().map(|range| range.end),
            line,
            column,
        }
    }

    /// A diagnostic of this module's own, about no place in the document.
    pub fn detached(severity: Severity, message: &str, hints: Vec<String>) -> Self {
        Self {
            severity: Self::severity_name(severity),
            message: message.into(),
            hints,
            path: None,
            start: None,
            end: None,
            line: None,
            column: None,
        }
    }

    /// The name JavaScript sees for `severity`.
    fn severity_name(severity: Severity) -> &'static str {
        match severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
        }
    }
}

/// An error without a location in the document, as Typst's compilation reports one.
pub fn detached_error(message: impl Into<EcoString>) -> EcoVec<SourceDiagnostic> {
    eco_vec![SourceDiagnostic::error(Span::detached(), message)]
}
