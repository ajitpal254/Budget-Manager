// Pagination query-param parsing shared by paginated endpoints.
//
// Garbage / missing values fall back to sane defaults; limit is clamped so
// a client can never ask for an unbounded result set.

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePagination = (pageRaw, limitRaw) => {
  let page = parseInt(pageRaw, 10);
  let limit = parseInt(limitRaw, 10);
  if (!Number.isInteger(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);
  return { page, limit };
};

module.exports = { parsePagination, DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT };
