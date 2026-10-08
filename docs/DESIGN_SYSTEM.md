# Kairos interface system

The implementation lives in `src/renderer/src/styles/operator.css`. The renderer starts in dark mode for new users and retains a saved light or high contrast preference.

## Visual language

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| Canvas | `#101512` | `#f5f6f2` | App background |
| Surface | `#191f1b` | `#fffefa` | Panels and forms |
| Border | `#2e3931` | `#d9ddd3` | Structure and grouping |
| Primary text | `#edf3e9` | `#1b251e` | Titles and data |
| Secondary text | `#a4b0a6` | `#536057` | Supporting copy |
| Signal | `#c3df83` | `#a7c65d` | Active state and primary action |

The signal color is reserved for action, focus, active navigation, and status that needs attention. Success, warning, error, and information have separate semantic tokens. Layout uses borders and negative space to express hierarchy; panels do not rely on floating shadows.

## Typography and spacing

- Headings use Bahnschrift when available, with Arial Narrow and Segoe UI fallbacks. Body copy uses Segoe UI and system sans. Numeric labels, technical status, and section indexes use Cascadia Code or Consolas. This font stack works offline.
- Screen titles are 25–34px. The overview greeting scales up to 62px. Section titles are 16–21px. Working copy is 12–13px. Metadata and control labels are 9–10px, uppercase with controlled letter spacing.
- A 4px rhythm drives paddings and gaps. Standard screen gutters are 24–48px; panel paddings are 18–24px; compact controls are 34–37px high.
- Corners are 2–3px. Motion is limited to 150–240ms state changes and is disabled by `prefers-reduced-motion`.

## Components and layout

- The navigation rail groups daily work and intelligence, with an active line and accessible labels in its compact state.
- The top bar shows location, local model status, theme control, and an on demand assistant panel.
- A 36px custom window bar provides drag, minimize, maximize, and close controls on packaged desktop builds. Close hides Kairos in the tray; the tray menu provides Open and Quit.
- `PageHeader`, `Tabs`, `Badge`, `EmptyState`, inputs, buttons, panels, and metric blocks share tokens across feature screens.
- Exam, lesson, marking, and report screens use a bounded configuration panel alongside a larger work surface. OMR uses the same hierarchy in a full width view.
- The question bank is currently a view over saved exam questions. A durable, independent question library is planned in the roadmap.
- The layout collapses the navigation rail at narrower widths and stacks the question bank and workflows for small viewports.
