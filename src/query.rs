//! What a query evaluates and returns, as the CLI's `typst eval 'query(<selector>)'` does.

use typst::World;
use typst::comemo::{Track, TrackedMut};
use typst::diag::SourceResult;
use typst::engine::Sink;
use typst::foundations::{Content, Context, IntoValue, Scope, StyleChain, Value};
use typst::introspection::Introspector;
use typst::routines::SpanMode;
use typst::syntax::{RangeMapper, Span, SyntaxMode};
use typst_layout::PagedDocument;

use crate::diagnostic::detached_error;
use crate::options::QuerySettings;
use crate::world::{EXPRESSION_ID, InMemoryWorld};

/// Evaluates `expression` as the CLI's `typst eval` does: as code, with the document's
/// introspector, so that `query()` sees its elements.
pub fn evaluate(
    world: &InMemoryWorld,
    expression: &str,
    sink: &mut Sink,
    document: &PagedDocument,
) -> SourceResult<Value> {
    let mapper = RangeMapper::new(Some(0..expression.len())).expect("a valid range");
    let introspector: &dyn Introspector = &**document.introspector();
    let library = world.library();
    typst_eval::eval_string(
        (world as &dyn World).track(),
        library,
        TrackedMut::reborrow_mut(&mut sink.track_mut()),
        introspector.track(),
        Context::new(None, Some(StyleChain::new(&library.styles))).track(),
        expression,
        SpanMode::Mapped {
            id: *EXPRESSION_ID,
            mapper: &mapper,
            mapper_error_span: Span::detached(),
        },
        SyntaxMode::Code,
        Scope::default(),
    )
}

/// The elements, or their `field`, as JSON; with `one`, the single element, as the CLI's
/// `typst query --field --one` selected them.
pub fn select_elements(elements: Vec<Content>, settings: &QuerySettings) -> SourceResult<String> {
    let one = settings.one;
    if one && elements.len() != 1 {
        return Err(detached_error(format!(
            "expected exactly one element, found {}",
            elements.len()
        )));
    }
    let mapped: Vec<Value> = elements
        .into_iter()
        .filter_map(|element| match settings.field.as_deref() {
            Some(field) => element.get_by_name(field).ok(),
            None => Some(element.into_value()),
        })
        .collect();
    let json = if one {
        let first = mapped
            .first()
            .ok_or_else(|| detached_error("no such field found for element"))?;
        serde_json::to_string(first)
    } else {
        serde_json::to_string(&mapped)
    };
    json.map_err(|serialization| detached_error(serialization.to_string()))
}
