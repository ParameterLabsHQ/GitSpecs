# GitSpecs True Clone fidelity matrix

**Status:** living inventory for P24a–P24e  
**Design:** [2026-08-05-true-clone-fidelity-design.md](./superpowers/specs/2026-08-05-true-clone-fidelity-design.md)  
**Updated:** 2026-08-05

Legend: **Shipped** | **Partial** | **Missing** | **N/A**

| ID | Surface | Target track | Status |
|----|---------|--------------|--------|
| M01 | Activity Home container (`gitspecs.home`) | P24c | Shipped |
| M02 | Activity Inspect container (`gitspecs.inspect`) | P24a | Shipped |
| M03 | Activity Graph container (`gitspecs.graph`) | P24c | Shipped |
| M04 | SCM object browsers (grouped + optional lists) | P24c | Shipped |
| M05 | File History tree view | P24a | Shipped |
| M06 | Line History tree view | P24a | Shipped |
| M07 | Visual File History entry | P24a | Shipped |
| M08 | Search & Compare entry points | P24a | Partial (commands; no dedicated inspect tree) |
| M09 | Current-line EOL blame (default on) | P24b | Shipped |
| M10 | File blame gutter + toggle | P24b | Shipped |
| M11 | File heatmap gutter | P24b | Shipped |
| M12 | Changes annotations | P24b | Shipped |
| M13 | Details hover + multi-action links | P24b | Shipped |
| M14 | Changes (previous line) hover | P24b | Shipped |
| M15 | CodeLens + toggle | P24b / P24e | Shipped |
| M16 | Status bar blame | P2 | Shipped |
| M17 | Modes Zen / Review / Inspect | P24d | Shipped |
| M18 | Keybindings Alt+B / Shift+Alt+B | P24e | Shipped |
| M19 | Commit Graph canvas affordance | P24c | Shipped |
| M20 | Hub under Home | P24c | Shipped |
| M23 | Cloud Patches / Code Suggest | — | N/A |
| M24–M26 | Git Command Palette / Commit Details / Settings UI | P24f | Missing |

When a track lands, update this table and `docs/ROADMAP.md` Section 2 in the same change.