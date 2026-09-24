# Landing payload after the owner’s glass redesign

Measured from clean builds of the commit before the design and the new design commit, using
`node scripts/check-landing-budget.mjs` in each export:

| Built page | Markup + linked CSS, gzip | JavaScript, raw | Images, raw |
| --- | ---: | ---: | ---: |
| Before the glass redesign | 18,984 B | 24,983 B | 31,955 B |
| Glass redesign | 19,825 B | 25,151 B | 31,955 B |

The design added 841 B gzip to the blocking markup and CSS. The old 19,000 B limit had 16 B of
headroom before this requested redesign, so it could not accommodate the new matte surfaces and
motion. The new limit is 20,000 B, only 175 B above the measured page. JavaScript remains capped
at 36,000 B raw and images at 40,000 B raw. The checker still reads the actual built files.

The resulting page was built and rendered at 1440 px and 390 px. Both have one main landmark and
no horizontal document overflow; site tests passed 316/316 and the web app passed 2,417/2,417.
The live static deploy verified every served file against that build. This budget update records
the size cost of the owner’s visual decision rather than treating the design as free.
