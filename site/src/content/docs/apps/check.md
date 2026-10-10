---
title: Check your app
description: wake check tests an app against the wake/v1 spec without pairing or changing anything.
---

```bash
wake check acme.dev
```

```
wake/v1 at https://acme.dev · docs/spec/wake-v1.md
  ✓ Discovery: /.well-known/wake is wake/v1, on secure URLs, with no redirect
  ✓ Pair refuses a code nobody issued: 400 code_invalid
  ✓ Pair refuses a body of the wrong shape: 400 invalid_body
  ✓ Forget refuses a key that opens nothing: 401
  ✓ wake:pending throws UNPAIRED for a key that opens nothing
  ✓ wake:claim throws UNPAIRED
  ✓ wake:finish throws UNPAIRED
  ✓ wake:started (optional) throws UNPAIRED

✓ Wake can pair with it.
```

Every probe is one your app must refuse (a code nobody issued, a key that
opens nothing), so it pairs nothing and changes nothing; it is safe against
production. It exits non-zero when a probe fails, so it fits in CI.

`wake:started` is optional: an app without it passes, with "isn't served"
beside it, and its users' agents comment that they started instead.

For a dev server, pass its address: `wake check localhost:3000`. Plain
http is allowed only on this machine.
