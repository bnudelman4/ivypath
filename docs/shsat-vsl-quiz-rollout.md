# SHSAT VSL → parent quiz → meeting

Local implementation, 2026-10-16. No production activation.

## Scope and source

Reuses PR43's quiz at `a2c14a90fc2315df0cdf8109c988b29d2d3329af`, integrating site main `6c2db2c5ab40d3de91ec474e056d87642c0b194a` locally. Integration baseline: `c8e3ab14ec531e0654cc185f306b6a2ae7e4b251`. The owner now requests the VSL to remain on and the main landing-page action to open the parent quiz, followed by the existing meeting booking flow. This supersedes the older spec's landing-page scope restriction (D11, 1.6, acceptance flow 13). No changes to SAT assets, copy, routes or conversion labels.

`/shsat` keeps the visible `assets/ivypath-shsat-vsl-v5.mp4` and v5 poster. Primary landing-page and SHSAT mobile sticky links open `/shsat/quiz`; the existing six-question parent flow, consent gate and `/book.html` handoff are reused. Direct diagnostic and secondary booking links remain available. Student mode also suppresses ad bootstrapping and video events when returning to the landing page.

`SHOW_VSL` in `shsat-quiz.js` controls a separate, unused results-page video template. It does not control the upstream hero. Keeping this optional duplicate off does not turn off the requested VSL. Its legacy asset/transcript have not been replaced with invented content.

## Historical narration concerns

The September design spec D6 attributes the following concerns to the old unversioned `assets/ivypath-shsat-vsl.mp4`, based on an old transcript: “kids”; a 20/200-point comparison; “real, full-length test”; current-year cutoff claims; “about an hour”; and a diagnostic CTA. These concerns have **not** been verified against the current v5 audio. They are review notes, not grounds for silently hiding the owner-requested video. Review v5 narration/captions for current product accuracy and the quiz CTA before release; any media revision is separate work.

## Launch dependencies

- Independent correctness and security/privacy reviews of the full PR43 recovery plus this focused delta. Local browser simulations do not establish live deployment parity.
- Platform PR119/120 are reported merged by the owner; no reimplementation here. Migration application and authorized endpoint smoke remain unproven. Do not query product records to infer readiness.
- `QUIZ_BACKEND='site'` remains the recovered default until live platform readiness and the planned switch are explicitly established. Verify the site's existing sender credentials, sender identities and consent/alert behavior through the authorized release process; no secrets or real lead/email writes were used here.
- Keep `PLAN_COPY=false` pending approved public copy. Confirm named texter identity/photo, schedule and replies for any enabled text CTA against the existing quiz rollout. Do not invent personal identity or availability.
- Quiz Ads conversion label remains a placeholder. Existing booking conversion and `/thank-you.html` routing remain unchanged. Do not enable or change advertising budgets as part of release.
- Review the existing spec's full release/rollback checklist, production privacy retention and rate-limit configuration. Manual Safari/VoiceOver, real device media playback/captions and live email/calendar delivery remain release checks, not claims from Chromium fixtures.
- No remote push, publication, deployment, product migration or live provider call is authorized by this local patch.

## Local verification

The repository Node tests stub fetch/calendar/email calls. Playwright's local harness uses a loopback email stub, blocks external browser traffic and stubs availability/booking APIs. The extended booking test starts at `/shsat`, verifies the visible v5 source and quiz CTA at each viewport, completes the existing consent gate, verifies the quiz booking payload, clears prefill state on success and checks the unchanged booking conversion. A regression test selects student, returns to `/shsat`, and requires zero ad script loads, ad requests or Meta events, including synthetic video interactions. Existing send-link request-body regression coverage remains.

Test commands and final results are recorded in the verification deliverable. They are not live smoke evidence.
