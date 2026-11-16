// Makes https://mkcards.pages.dev show the MK Cards Worker, keeping the pages.dev address in the browser.
export default {
  fetch(request, env) {
    return env.APP.fetch(request);
  },
};
