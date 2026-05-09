# TODO

- [x] UI/UX: Add dark-mode theme variables + palette
- [x] UI/UX: Add skeletons, spinner, improved status/toast animations
- [x] UI/UX: Add micro-interactions (button hover/active, panel/table row hover)
- [x] UI/UX: Enhance mobile responsiveness (iPhone 11-like: tighter paddings, larger tap targets, no overflow)
- [x] UI/UX: Update index.html with global toast container/loading hooks
- [x] UI/UX: Update app.js to toggle loading indicators during async flows
- [ ] Verification: sanity-check open flow in browser for layout breaks
- [x] Security: Remove master password recovery code feature (Google Authenticator only)
- [x] Security: Add Google Authenticator TOTP reset flow (3-step: verify TOTP → new password → confirm)
- [x] Security: Add max_attempts=5 lockout on TOTP verification with 15-min auto-lock
- [x] Security: Add "Forgot password?" link on vault gate → resetGate screen
- [x] Security: Session invalidation on master password change (sessionStorage cleared)
- [x] UI/UX: Add step indicator, user strip, and loading overlays to reset flow


