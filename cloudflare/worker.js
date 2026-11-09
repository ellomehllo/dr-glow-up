// Serves the static game from Workers static assets. www.doctorglowup.site forwards to
// doctorglowup.site, so every player has one address (and one set of saved progress).
const HOME = 'doctorglowup.site';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${HOME}`) {
      url.hostname = HOME;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
