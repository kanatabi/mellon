// A2 restyle (SHADCN.md §2.3): every width matches mellon's RENDERED
// geometry, not the block's defaults —
//
//   SIDEBAR_WIDTH        15rem  — expanded rail = today's `lg:w-60`
//                               (= DESIGN §11.1's 240px; the `--container-nav`
//                               var it corresponds to has zero consumers)
//   SIDEBAR_WIDTH_ICON   4.25rem — collapsed rail = today's `lg:w-[4.25rem]`
//                               (the plan's "3.5rem" misread the topbar's
//                               height as the rail width)
//   SIDEBAR_WIDTH_MOBILE 16rem  — the sheet = today's `w-64`
//
// The cookie constants are gone with the cookie line itself (D6: rails live
// in localStorage, nothing server-side reads them).
export const SIDEBAR_WIDTH = '15rem';
export const SIDEBAR_WIDTH_MOBILE = '16rem';
export const SIDEBAR_WIDTH_ICON = '4.25rem';
export const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
