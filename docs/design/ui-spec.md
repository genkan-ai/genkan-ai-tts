# GenkanAI MVP UI Specification

- Status: Implementation specification
- Scope: Software-only MVP
- Desktop concept: `resident-dashboard-concept-v2.png`
- Mobile concept: `visitor-intercom-concept.png`

## Direction

GenkanAIの画面は、防犯カメラや住宅設備の操作盤ではなく、来訪者との会話を安全に仲介する落ち着いた生活ツールとして設計する。背景は純白、主要操作は柿色、安全状態は控えめな緑、拒否と障害は赤を使う。

## Design tokens

- Background: `#ffffff`
- Subtle surface: `#f6f7f8`
- Text: `#20252b`
- Muted text: `#66717d`
- Border: `#dfe3e6`
- Primary: `#f05a16`
- Primary hover: `#d84b0b`
- Safe: `#258a4a`
- Risk: `#c83a3a`
- Warning surface: `#fff7ec`
- Radius: 8px controls, 14px panels, 18px major surfaces
- Shadow: only one quiet elevation level for the active-session surface
- Font: system Japanese sans-serif stack

## Desktop resident dashboard

- Left navigation contains the product name, resident dashboard, visitor simulator, and safety state.
- The main region contains active visitor identity, purpose, classification evidence, risk, session state, and transcript.
- The right status region shows the AI's final response and automated outcome; it contains no resident response controls.
- Recent visits use a row list, not a card grid.
- There is no camera preview, photo, unlock control, or hardware status.

## Mobile visitor intercom

- The primary action begins a virtual intercom session.
- During a session, the screen shows a compact transcript and text input fallback.
- The visitor never sees whether a resident is home or whether a child is present.
- Microphone support is represented as a future capability; the first implementation is text-driven.
- The end-session action remains visible and distinct from the primary action.

## Component families

- App shell and compact navigation
- Status line with dot and text
- Active visit open surface
- Transcript rows with speaker labels
- Primary and neutral actions for navigation and the visitor flow
- Recent visit rows
- Empty, waiting, completed, and failure states

## Motion

- Use short opacity and translate transitions for state changes.
- Use a subtle pulse only for a live-session status dot.
- Respect `prefers-reduced-motion`.
