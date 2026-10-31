// Budget-alert threshold validation shared by the User schema and the
// settings API. Unset values fall back to the app-wide 80/100 defaults.

const DEFAULT_WARNING_PCT = 80;
const DEFAULT_DANGER_PCT = 100;

const isValidThresholds = (warningPct, dangerPct) => {
  const w = warningPct != null ? warningPct : DEFAULT_WARNING_PCT;
  const d = dangerPct != null ? dangerPct : DEFAULT_DANGER_PCT;
  return (
    Number.isFinite(w) &&
    Number.isFinite(d) &&
    w >= 1 && w <= 100 &&
    d >= 1 && d <= 100 &&
    w < d
  );
};

module.exports = { isValidThresholds, DEFAULT_WARNING_PCT, DEFAULT_DANGER_PCT };
