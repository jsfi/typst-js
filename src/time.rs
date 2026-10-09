//! Dates from JavaScript's clock, for `datetime.today()` and the PDF's creation date.

use typst::foundations::Datetime;
use typst_pdf::Timestamp;

/// The calendar fields of a time in milliseconds since 1970, in UTC or in local time.
pub struct DateFields {
    year: i32,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
}

impl DateFields {
    /// The fields in UTC of `milliseconds` since 1970.
    pub fn utc(milliseconds: f64) -> Self {
        let date = js_sys::Date::new(&milliseconds.into());
        Self {
            year: date.get_utc_full_year() as i32,
            month: (date.get_utc_month() + 1) as u8,
            day: date.get_utc_date() as u8,
            hour: date.get_utc_hours() as u8,
            minute: date.get_utc_minutes() as u8,
            second: date.get_utc_seconds() as u8,
        }
    }

    /// The fields in local time, read as the UTC fields of the time moved by its local offset in
    /// minutes, `offset` as JavaScript's `getTimezoneOffset` gives it.
    pub fn local(milliseconds: f64, offset: f64) -> Self {
        Self::utc(milliseconds - offset * 60_000.0)
    }

    pub fn date(&self) -> Option<Datetime> {
        Datetime::from_ymd(self.year, self.month, self.day)
    }

    fn datetime(&self) -> Option<Datetime> {
        Datetime::from_ymd_hms(
            self.year,
            self.month,
            self.day,
            self.hour,
            self.minute,
            self.second,
        )
    }
}

/// The PDF creation date: a fixed time in UTC, or now in local time with its offset, as the CLI
/// writes it with and without `--creation-timestamp`. Both to the second.
pub fn pdf_timestamp(timestamp: Option<f64>) -> Option<Timestamp> {
    match timestamp {
        Some(milliseconds) => DateFields::utc((milliseconds / 1000.0).floor() * 1000.0)
            .datetime()
            .map(Timestamp::new_utc),
        None => {
            let now = js_sys::Date::now();
            let offset = timezone_offset(now);
            let datetime = DateFields::local(now, offset).datetime()?;
            Timestamp::new_local(datetime, -(offset as i32))
        }
    }
}

/// The local time's offset at `milliseconds`, in minutes behind UTC, as JavaScript gives it.
pub fn timezone_offset(milliseconds: f64) -> f64 {
    js_sys::Date::new(&milliseconds.into()).get_timezone_offset()
}
