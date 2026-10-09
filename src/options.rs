//! Reading the option objects JavaScript passes in. Invalid values throw with the
//! reasons the typst CLI gives for the same values.

use std::num::NonZeroUsize;
use std::str::FromStr;

use typst::diag::Severity;
use typst::foundations::{Dict, IntoValue, Str};
use typst::layout::{PageRange, PageRanges};
use typst_pdf::{PdfStandard, PdfStandards};

use crate::diagnostic::Diagnostic;
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const OPTIONS: &str = r#"
export interface PdfOptions {
    /**
     * Whether to write a tagged PDF, the structure accessibility tools read. Defaults to `true`, like
     * Typst. An untagged PDF is far smaller and faster to write for table-heavy documents.
     */
    tagged?: boolean;
    /**
     * The document's creation date, as a `Date` or milliseconds since 1970, written in UTC; it is also
     * what `datetime.today()` returns during this compilation. Defaults to now, in local time.
     */
    timestamp?: Date | number;
    /** PDF standards to enforce, as the CLI names them: "1.4" … "2.0", "a-1b" … "a-4e", "ua-1". */
    pdfStandards?: string[];
    /**
     * The pages to export, as the CLI takes them: "2,5", "3-6", "8-". Defaults to all. A selection is
     * exported untagged, with a warning unless `tagged` is `false`.
     */
    pages?: string;
}

export interface SvgOptions {
    /** The pages to export, as for `PdfOptions.pages`. Defaults to all. */
    pages?: string;
}

export interface QueryOptions {
    /** Extracts this field from every element found, leaving out elements without it. */
    field?: string;
    /** Expects exactly one element and returns it instead of an array. */
    one?: boolean;
}
"#;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "PdfOptions")]
    pub type PdfOptions;

    #[wasm_bindgen(typescript_type = "SvgOptions")]
    pub type SvgOptions;

    #[wasm_bindgen(typescript_type = "QueryOptions")]
    pub type QueryOptions;

    #[wasm_bindgen(typescript_type = "Record<string, string>")]
    pub type Inputs;
}

/// The PDF options, read and checked.
#[derive(Default)]
pub struct PdfSettings {
    /// `tagged` as given; `tagged()` is what the PDF gets.
    pub requested_tagged: Option<bool>,
    /// Milliseconds since 1970.
    pub timestamp: Option<f64>,
    pub standards: Option<Vec<PdfStandard>>,
    pub pages: Option<PageRanges>,
}

impl PdfOptions {
    pub fn read(&self) -> Result<PdfSettings, JsError> {
        let timestamp = read_option(self, "timestamp")?;
        let standards = read_option(self, "pdfStandards")?;
        let pages = read_option(self, "pages")?;
        Ok(PdfSettings {
            requested_tagged: boolean_option(self, "tagged", "PdfOptions.tagged")?,
            timestamp: present(&timestamp).map(milliseconds).transpose()?,
            standards: present(&standards).map(parse_pdf_standards).transpose()?,
            pages: present(&pages)
                .map(|value| page_ranges(value, "PdfOptions.pages"))
                .transpose()?,
        })
    }
}

/// The CLI's warning that a page selection leaves the PDF untagged, which is also its hint when it
/// refuses a standard that requires tags.
const PAGES_IMPLY_UNTAGGED: &str = "using pages implies tagged: false";

impl PdfSettings {
    /// Whether the PDF is tagged: unless `tagged: false` is given, and never for a page selection,
    /// which Typst cannot tag.
    pub fn tagged(&self) -> bool {
        self.requested_tagged.unwrap_or(true) && self.pages.is_none()
    }

    /// Whether the page selection, not `tagged: false`, leaves the PDF untagged. The CLI warns
    /// about it, and refuses the standards that require tags with a hint saying so.
    pub fn untagged_by_pages(&self) -> bool {
        self.pages.is_some() && self.requested_tagged != Some(false)
    }

    /// The CLI's warning that the page selection leaves the PDF untagged, unless `tagged: false`
    /// says so already.
    pub fn pages_warning(&self) -> Option<Diagnostic> {
        self.untagged_by_pages().then(|| {
            Diagnostic::detached(
                Severity::Warning,
                PAGES_IMPLY_UNTAGGED,
                vec![
                    "the resulting PDF will be inaccessible".into(),
                    "set tagged: false to silence this warning".into(),
                ],
            )
        })
    }

    /// The standards to export with, or the CLI's refusal: a standard that requires tags while the
    /// PDF is untagged, or standards that exclude each other.
    pub fn pdf_standards(&self) -> Result<PdfStandards, Diagnostic> {
        let standards = self.standards.as_deref().unwrap_or_default();
        if !self.tagged()
            && let Some((_, name)) = ACCESSIBLE_STANDARDS
                .iter()
                .find(|(standard, _)| standards.contains(standard))
        {
            let hints = if self.untagged_by_pages() {
                vec![PAGES_IMPLY_UNTAGGED.into()]
            } else {
                Vec::new()
            };
            let message = format!("cannot disable PDF tags when exporting a {name} document");
            return Err(Diagnostic::detached(Severity::Error, &message, hints));
        }
        PdfStandards::new(standards).map_err(|error| {
            let hints = error.hints().iter().map(ToString::to_string).collect();
            Diagnostic::detached(Severity::Error, error.message(), hints)
        })
    }
}

impl SvgOptions {
    pub fn pages(&self) -> Result<Option<PageRanges>, JsError> {
        let pages = read_option(self, "pages")?;
        present(&pages)
            .map(|value| page_ranges(value, "SvgOptions.pages"))
            .transpose()
    }
}

/// The query options, read and checked.
#[derive(Default)]
pub struct QuerySettings {
    pub field: Option<String>,
    pub one: bool,
}

impl QueryOptions {
    pub fn read(&self) -> Result<QuerySettings, JsError> {
        Ok(QuerySettings {
            field: typed_option(
                self,
                "field",
                "QueryOptions.field",
                "a string",
                JsValue::as_string,
            )?,
            one: boolean_option(self, "one", "QueryOptions.one")?.unwrap_or(false),
        })
    }
}

impl Inputs {
    /// The inputs as `sys.inputs`, trimmed like the CLI's `--input key=value`.
    pub fn read(&self) -> Result<Dict, JsError> {
        // Checked before `Object.entries` reads them: a JavaScript exception thrown inside the
        // module would leave the compiler unusable.
        let value: &JsValue = self.as_ref();
        if !value.is_object() || js_sys::Array::is_array(value) {
            return Err(JsError::new("inputs must be an object"));
        }
        let mut dict = Dict::new();
        for entry in js_sys::Object::entries(self.unchecked_ref::<js_sys::Object>()).iter() {
            let entry: js_sys::Array = entry.unchecked_into();
            let key = entry.get(0).as_string().unwrap_or_default();
            let value = entry.get(1);
            let Some(value) = value.as_string() else {
                return Err(JsError::new(&format!(
                    "invalid value for input '{key}': inputs must be strings"
                )));
            };
            if key.contains('=') {
                return Err(JsError::new(&format!(
                    "invalid input key '{key}': it must not contain '='"
                )));
            }
            let key = key.trim();
            if key.is_empty() {
                return Err(JsError::new(&format!(
                    "invalid input key '{key}': the key was missing or empty"
                )));
            }
            // A program argument cannot hold NUL, so the CLI cannot take such an input either.
            if key.contains('\0') || value.contains('\0') {
                return Err(JsError::new(&format!(
                    "invalid input '{key}': inputs must not contain NUL characters"
                )));
            }
            dict.insert(Str::from(key), value.trim().into_value());
        }
        Ok(dict)
    }
}

/// The settings `read` gets from `options`, or the defaults without options.
pub fn settings<O, S: Default>(
    options: Option<&O>,
    read: impl Fn(&O) -> Result<S, JsError>,
) -> Result<S, JsError> {
    options.map(read).transpose().map(Option::unwrap_or_default)
}

/// An argument that has to be a string, which JavaScript does not check.
pub fn string_argument(value: &JsValue, name: &str) -> Result<String, JsError> {
    value
        .as_string()
        .ok_or_else(|| JsError::new(&format!("{name} must be a string")))
}

/// An argument that has to be a `Uint8Array`, which JavaScript does not check.
pub fn bytes_argument(value: &JsValue, name: &str) -> Result<Vec<u8>, JsError> {
    value
        .dyn_ref::<js_sys::Uint8Array>()
        .map(js_sys::Uint8Array::to_vec)
        .ok_or_else(|| JsError::new(&format!("{name} must be a Uint8Array")))
}

/// The option `name` of `object`, unless it is `undefined` or `null`, converted by `convert`; or the
/// error that the option, named `label` in messages, must be `expected`, such as "a boolean".
fn typed_option<T>(
    object: &JsValue,
    name: &str,
    label: &str,
    expected: &str,
    convert: impl Fn(&JsValue) -> Option<T>,
) -> Result<Option<T>, JsError> {
    let value = read_option(object, name)?;
    present(&value)
        .map(|value| {
            convert(value).ok_or_else(|| JsError::new(&format!("{label} must be {expected}")))
        })
        .transpose()
}

/// The boolean option `name` of `object`, unless it is `undefined` or `null`.
fn boolean_option(object: &JsValue, name: &str, label: &str) -> Result<Option<bool>, JsError> {
    typed_option(object, name, label, "a boolean", JsValue::as_bool)
}

/// The option `name` of `object`, as JavaScript reads the property.
fn read_option(object: &JsValue, name: &str) -> Result<JsValue, JsError> {
    js_sys::Reflect::get(object, &JsValue::from_str(name))
        .map_err(|_| JsError::new(&format!("option {name} could not be read")))
}

/// `value` if it is present, that is neither `undefined` nor `null`, as an optional option is read.
fn present(value: &JsValue) -> Option<&JsValue> {
    (!value.is_undefined() && !value.is_null()).then_some(value)
}

/// The years 0 to 9999 in UTC, the four digits a PDF date has for its year. Typst drops an earlier
/// date without a word and fails on a later one as if the document were at fault.
const TIMESTAMP_RANGE: std::ops::RangeInclusive<f64> =
    -62_167_219_200_000.0..=253_402_300_799_999.0;

fn milliseconds(value: &JsValue) -> Result<f64, JsError> {
    let milliseconds = match value.dyn_ref::<js_sys::Date>() {
        Some(date) => date.get_time(),
        None => value.as_f64().ok_or_else(|| {
            JsError::new("PdfOptions.timestamp must be a Date or a number of milliseconds")
        })?,
    };
    if !milliseconds.is_finite() {
        Err(JsError::new("PdfOptions.timestamp is not a valid date"))
    } else if !TIMESTAMP_RANGE.contains(&milliseconds) {
        Err(JsError::new(
            "PdfOptions.timestamp is out of range: a PDF date has a year from 0 to 9999",
        ))
    } else {
        Ok(milliseconds)
    }
}

/// The standards that require a tagged PDF, with the names the CLI's errors give them.
const ACCESSIBLE_STANDARDS: [(PdfStandard, &str); 4] = [
    (PdfStandard::A_1a, "PDF/A-1a"),
    (PdfStandard::A_2a, "PDF/A-2a"),
    (PdfStandard::A_3a, "PDF/A-3a"),
    (PdfStandard::Ua_1, "PDF/UA-1"),
];

/// The CLI's names, in the order its help lists them.
const PDF_STANDARDS: [&str; 17] = [
    "1.4", "1.5", "1.6", "1.7", "2.0", "a-1b", "a-1a", "a-2b", "a-2u", "a-2a", "a-3b", "a-3u",
    "a-3a", "a-4", "a-4f", "a-4e", "ua-1",
];

fn parse_pdf_standards(value: &JsValue) -> Result<Vec<PdfStandard>, JsError> {
    let invalid = || JsError::new("PdfOptions.pdfStandards must be an array of strings");
    let array = value.dyn_ref::<js_sys::Array>().ok_or_else(invalid)?;
    array
        .iter()
        .map(|item| {
            let name = item.as_string().ok_or_else(invalid)?;
            // `PdfStandard` deserializes from the CLI's names, which is where the CLI takes them from.
            serde_json::from_value(serde_json::Value::String(name.clone())).map_err(|_| {
                JsError::new(&format!(
                    "invalid value '{name}' for PdfOptions.pdfStandards: expected one of {}",
                    PDF_STANDARDS.join(", ")
                ))
            })
        })
        .collect()
}

fn page_ranges(value: &JsValue, option: &str) -> Result<PageRanges, JsError> {
    let text = value
        .as_string()
        .ok_or_else(|| JsError::new(&format!("{option} must be a string")))?;
    text.split(',')
        .map(|part| {
            page_range(part).map_err(|reason| {
                JsError::new(&format!("invalid value '{part}' for {option}: {reason}"))
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map(PageRanges::new)
}

/// One comma-separated part of a page selection, as the CLI's `--pages` reads it.
fn page_range(value: &str) -> Result<PageRange, &'static str> {
    match value
        .split('-')
        .map(str::trim)
        .collect::<Vec<_>>()
        .as_slice()
    {
        [] | [""] => Err("page export range must not be empty"),
        [single] => {
            let page = page_number(single)?;
            Ok(Some(page)..=Some(page))
        }
        ["", ""] => Err("page export range must have start or end"),
        [start, ""] => Ok(Some(page_number(start)?)..=None),
        ["", end] => Ok(None..=Some(page_number(end)?)),
        [start, end] => {
            let (start, end) = (page_number(start)?, page_number(end)?);
            if start > end {
                Err("page export range must end at a page after the start")
            } else {
                Ok(Some(start)..=Some(end))
            }
        }
        _ => Err("page export range must have a single hyphen"),
    }
}

fn page_number(value: &str) -> Result<NonZeroUsize, &'static str> {
    if value == "0" {
        Err("page numbers start at one")
    } else {
        NonZeroUsize::from_str(value).map_err(|_| "not a valid page number")
    }
}
