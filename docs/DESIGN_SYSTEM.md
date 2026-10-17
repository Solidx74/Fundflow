# FundFlow design system (as implemented in `app/globals.css`)
Direction: calm, structured, professional. Warm neutral background, deep green accent, serif headings, no decorative gradients or animation. No redesign in this phase.

## Principles
Grant data first. Show uncertainty, never hide it. One primary action per area. Distinguish source facts, assessment, AI suggestions and human corrections. Never imply an integration is live when it is not.

## Color tokens (light, dark in parentheses)
bg #f6f3ec (#111815), card #fff (#1a2420), ink #1d2a26 (#eaf1ee), muted #5d6b66 (#9db0a8), line #e2ddd0 (#2b3a34), brand #1f6b57 (#5fc4a6), brand tint #e8f2ee (#1c2e28), warn #b4531a (#e69a64), bad #a8302b (#f08a84). Semantic: ok = brand, warn = needs review or soon, bad = conflict or overdue. Never rely on color alone: badges carry text.

## Type and spacing
Headings Georgia, 24 px h1. Body system sans, 16 px, 1.5. Meta text 13 px muted. Spacing in 4, 8, 10, 12, 14, 20 px steps. Radius: controls 10, cards 12, panels 14, badges full. No shadows.

## Components
Buttons: primary (filled brand), default (outlined), minimum height 44 px, 32 px only for in-row actions. Fields: label above, 10 px by 12 px padding, visible 3 px focus outline. Cards: bordered, used for opportunities and summary figures. Badges: eligibility and status, always text. Tables: real `table` with header scope. Kanban: 8 columns, horizontal scroll inside the board, drag plus keyboard-accessible detail dialog for status.

## Behaviour
Dialog: takes focus on open, closes on Escape, restores focus. (gap: no focus trap, Tab can leave the dialog.) Notifications: bell with unread count, panel with mark read and mark all. (gap: panel does not close on Escape.)
States: loading uses a status message, empty states explain the next action, errors use `role="alert"`, success uses `role="status"`. Demo or unconfigured modes are labelled in warn color.

## Responsive
No media queries. Rows wrap (`flex: 1 1 150px`), the board scrolls horizontally, tables scroll in a container. Checked in a real browser at 390 px with a mocked backend: no page-level horizontal overflow and filter controls stay usable.

## Accessibility expectations
Labels on all fields. Keyboard access to every action. Visible focus. Reduced-motion respected. Not yet tested with a screen reader or real devices.
