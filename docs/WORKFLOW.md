# Release workflow

- `main` is production (letterlock-theta.vercel.app). Only merge into it when we're ready for everyone to get the update.
- `staging` is our own copy. Every push builds a private preview at
  `https://letterlock-git-staging-zenyinnaya-stars-projects.vercel.app`. Build, test and play-test here first.
- To ship: open a PR from `staging` into `main`, check the preview once more, then Merge.
- Modes other than Classic stay locked (`CLASSIC_ONLY` in `lib/modes.ts`) until we deliberately reopen them.
- `vault-heist-qa` is a throwaway branch that force-unlocks every mode for testing. Never merge it into `staging` or `main`.
