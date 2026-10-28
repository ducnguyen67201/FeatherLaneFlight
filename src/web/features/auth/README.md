# Sign-in and access presentation

`SignInPage` implements the approved P06 UI using the shared MUI theme. `AuthPageLayout` owns page structure; `AccessRequiredPanel` owns account/access feedback and actions. Mount the page within the existing ThemeProvider/CssBaseline and a viewport-height flex column, as demonstrated by `previews/P06/main.tsx`.

The required props distinguish signed-out/pending/error presentation from access-required/logout-error presentation. Access views require a display name and email; anonymous states cannot accidentally receive an invented default account. These are component props, not another session wire contract.

Callbacks notify the owning controller. The components do not fetch data, navigate to a guessed auth URL, write credentials, grant access or fabricate successful login/logout. Pending states expose labeled progress, and unavailable session retrieval has its own retry state. A failed access lookup must map to an error rather than claiming no membership. No project content is rendered here.

P06A supplies the real authentication endpoints and canonical identity/session contract on P05's reviewed backend foundation. P06.5 maps validated session data into these props and connects login, session refresh, CSRF-protected logout, routing and protected cache/stream cleanup. It starts only after P05 and P06 are verified merged and actual auth endpoints are ready; publication also requires merged backend dependencies. Real Google verification requires provider configuration. The normal web entry remains unchanged until that integration.

The isolated preview imports the actual components and supplies explicit sample identity and local presentation transitions. It contains all demo state controls; those controls are absent from production components. Run it with `previews/P06/README.md` instructions on port 4206.
