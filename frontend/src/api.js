// Central API helper for the Budget-Manager frontend.
//
// - Always sends `credentials: 'include'` so the httpOnly session cookie is
//   attached even when the frontend (e.g. Netlify) and the API backend
//   (e.g. Render) live on different origins.
// - Attaches the double-submit CSRF token header automatically, matching the
//   backend's csrfMiddleware expectations.

export const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return '';
};

export const apiFetch = (url, options = {}) => {
  const { headers = {}, ...rest } = options;
  return fetch(url, {
    credentials: 'include',
    ...rest,
    headers: {
      'x-csrf-token': getCookie('csrfToken'),
      ...headers,
    },
  });
};
