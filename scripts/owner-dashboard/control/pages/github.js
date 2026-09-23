// GitHub: the repo as github.com shows it (Primer), with the owner's writes behind the confirm modal.
// Tabs are page-local (st.tab): Code overview, Issues, Pull requests, Actions, Security, Insights,
// Settings. Every write is a spec (control/actions.js gh.*, control/actions/github.js ghx.*) that goes
// through app.act: Dialog, optional dry-run plan, POST, toast. The server (cc/platforms/github.mjs)
// re-checks ids, states and label names, so nothing here is trusted. Not here on purpose: deleting a
// branch, release or the repo, visibility, branch protection and security settings.
import { html, raw, num, pct, bytes, ago, arr, short, duration, isNum } from '../ui.js';
import { aid, gh, GH_SETTINGS } from '../actions.js';
import { ghx } from '../actions/github.js';
import { swBtn } from './kit.js';
import { rn, spark } from '../fx.js';

// Octicons 19.38.0 (MIT, https://github.com/primer/octicons), 16px path data copied from @primer/octicons/build/svg/*-16.svg.
const O = {
  'alert': 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  'calendar': 'M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z',
  'check': 'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z',
  'check-circle-fill': 'M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z',
  'circle-slash': 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM3.965 13.096a6.5 6.5 0 0 0 9.131-9.131ZM1.5 8a6.474 6.474 0 0 0 1.404 4.035l9.131-9.131A6.499 6.499 0 0 0 1.5 8Z',
  'clock': 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z',
  'code': 'm11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z',
  'code-review': 'M1.75 1h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 13H8.061l-2.574 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25v-8.5C0 1.784.784 1 1.75 1ZM1.5 2.75v8.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25Zm5.28 1.72a.75.75 0 0 1 0 1.06L5.31 7l1.47 1.47a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-2-2a.75.75 0 0 1 0-1.06l2-2a.75.75 0 0 1 1.06 0Zm2.44 0a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1 0 1.06l-2 2a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L10.69 7 9.22 5.53a.75.75 0 0 1 0-1.06Z',
  'codescan': 'M8.47 4.97a.75.75 0 0 0 0 1.06L9.94 7.5 8.47 8.97a.75.75 0 1 0 1.06 1.06l2-2a.75.75 0 0 0 0-1.06l-2-2a.75.75 0 0 0-1.06 0ZM6.53 6.03a.75.75 0 0 0-1.06-1.06l-2 2a.75.75 0 0 0 0 1.06l2 2a.75.75 0 1 0 1.06-1.06L5.06 7.5l1.47-1.47Z M12.246 13.307a7.501 7.501 0 1 1 1.06-1.06l2.474 2.473a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM1.5 7.5a6.002 6.002 0 0 0 3.608 5.504 6.002 6.002 0 0 0 6.486-1.117.748.748 0 0 1 .292-.293A6 6 0 1 0 1.5 7.5Z',
  'comment': 'M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
  'credit-card': 'M10.75 9a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5h-1.5Z M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25ZM14.5 6.5h-13v5.75c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25Zm0-2.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25V5h13Z',
  'database': 'M1 3.5c0-.626.292-1.165.7-1.59.406-.422.956-.767 1.579-1.041C4.525.32 6.195 0 8 0c1.805 0 3.475.32 4.722.869.622.274 1.172.62 1.578 1.04.408.426.7.965.7 1.591v9c0 .626-.292 1.165-.7 1.59-.406.422-.956.767-1.579 1.041C11.476 15.68 9.806 16 8 16c-1.805 0-3.475-.32-4.721-.869-.623-.274-1.173-.62-1.579-1.04-.408-.426-.7-.965-.7-1.591Zm1.5 0c0 .133.058.318.282.551.227.237.591.483 1.101.707C4.898 5.205 6.353 5.5 8 5.5c1.646 0 3.101-.295 4.118-.742.508-.224.873-.471 1.1-.708.224-.232.282-.417.282-.55 0-.133-.058-.318-.282-.551-.227-.237-.591-.483-1.101-.707C11.102 1.795 9.647 1.5 8 1.5c-1.646 0-3.101.295-4.118.742-.508.224-.873.471-1.1.708-.224.232-.282.417-.282.55Zm0 4.5c0 .133.058.318.282.551.227.237.591.483 1.101.707C4.898 9.705 6.353 10 8 10c1.646 0 3.101-.295 4.118-.742.508-.224.873-.471 1.1-.708.224-.232.282-.417.282-.55V5.724c-.241.15-.503.286-.778.407C11.475 6.68 9.805 7 8 7c-1.805 0-3.475-.32-4.721-.869a6.15 6.15 0 0 1-.779-.407Zm0 2.225V12.5c0 .133.058.318.282.55.227.237.592.484 1.1.708 1.016.447 2.471.742 4.118.742 1.647 0 3.102-.295 4.117-.742.51-.224.874-.47 1.101-.707.224-.233.282-.418.282-.551v-2.275c-.241.15-.503.285-.778.406-1.247.549-2.917.869-4.722.869-1.805 0-3.475-.32-4.721-.869a6.327 6.327 0 0 1-.779-.406Z',
  'dependabot': 'M5.75 7.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Zm5.25.75a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 0 1.5 0v-1.5Z M6.25 0h2A.75.75 0 0 1 9 .75V3.5h3.25a2.25 2.25 0 0 1 2.25 2.25V8h.75a.75.75 0 0 1 0 1.5h-.75v2.75a2.25 2.25 0 0 1-2.25 2.25h-8.5a2.25 2.25 0 0 1-2.25-2.25V9.5H.75a.75.75 0 0 1 0-1.5h.75V5.75A2.25 2.25 0 0 1 3.75 3.5H7.5v-2H6.25a.75.75 0 0 1 0-1.5ZM3 5.75v6.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-6.5a.75.75 0 0 0-.75-.75h-8.5a.75.75 0 0 0-.75.75Z',
  'dot-fill': 'M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  'eye': 'M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z',
  'gear': 'M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z',
  'git-branch': 'M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  'git-commit': 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z',
  'git-merge': 'M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z',
  'git-pull-request': 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
  'git-pull-request-closed': 'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  'git-pull-request-draft': 'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z',
  'graph': 'M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z',
  'history': 'm.427 1.927 1.215 1.215a8.002 8.002 0 1 1-1.6 5.685.75.75 0 1 1 1.493-.154 6.5 6.5 0 1 0 1.18-4.458l1.358 1.358A.25.25 0 0 1 3.896 6H.25A.25.25 0 0 1 0 5.75V2.104a.25.25 0 0 1 .427-.177ZM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4Z',
  'info': 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  'issue-closed': 'M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69 5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0Zm-1.5 0a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0Z',
  'issue-opened': 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
  'key': 'M10.5 0a5.499 5.499 0 1 1-1.288 10.848l-.932.932a.749.749 0 0 1-.53.22H7v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22H5v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22h-2A1.75 1.75 0 0 1 0 14.25v-2c0-.199.079-.389.22-.53l4.932-4.932A5.5 5.5 0 0 1 10.5 0Zm-4 5.5c-.001.431.069.86.205 1.269a.75.75 0 0 1-.181.768L1.5 12.56v1.69c0 .138.112.25.25.25h1.69l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l1.023-1.025a.75.75 0 0 1 .768-.18A4 4 0 1 0 6.5 5.5ZM11 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  'law': 'M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.006.005-.01.01-.045.04c-.21.176-.441.327-.686.45C14.556 10.78 13.88 11 13 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.245.245 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.245.245 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.016.015-.045.04c-.21.176-.441.327-.686.45C4.556 10.78 3.88 11 3 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.249.249 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0Zm2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z',
  'link': 'm7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 1.998 1.998 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a1.998 1.998 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 1.998 1.998 0 0 0-2.83 0l-2.5 2.5a1.998 1.998 0 0 0 0 2.83Z',
  'lock': 'M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z',
  'play': 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z',
  'pulse': 'M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5h-2.742l-1.812 4.528a.751.751 0 0 1-1.392 0L6 4.77 4.696 8.03A.75.75 0 0 1 4 8.5H.75a.75.75 0 0 1 0-1.5h2.742l1.812-4.529A.751.751 0 0 1 6 2Z',
  'repo': 'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
  'repo-forked': 'M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z',
  'shield': 'M7.467.133a1.748 1.748 0 0 1 1.066 0l5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667Zm.61 1.429a.25.25 0 0 0-.153 0l-5.25 1.68a.25.25 0 0 0-.174.238V7c0 1.358.275 2.666 1.057 3.86.784 1.194 2.121 2.34 4.366 3.297a.196.196 0 0 0 .154 0c2.245-.956 3.582-2.104 4.366-3.298C13.225 9.666 13.5 8.36 13.5 7V3.48a.251.251 0 0 0-.174-.237l-5.25-1.68ZM8.75 4.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 1.5 0ZM9 10.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  'shield-check': 'm8.533.133 5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667l5.25-1.68a1.748 1.748 0 0 1 1.066 0Zm-.61 1.429.001.001-5.25 1.68a.251.251 0 0 0-.174.237V7c0 1.36.275 2.666 1.057 3.859.784 1.194 2.121 2.342 4.366 3.298a.196.196 0 0 0 .154 0c2.245-.957 3.582-2.103 4.366-3.297C13.225 9.666 13.5 8.358 13.5 7V3.48a.25.25 0 0 0-.174-.238l-5.25-1.68a.25.25 0 0 0-.153 0ZM11.28 6.28l-3.5 3.5a.75.75 0 0 1-1.06 0l-1.5-1.5a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l.97.97 2.97-2.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z',
  'shield-x': 'm8.533.133 5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.697 1.697 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667l5.25-1.68a1.748 1.748 0 0 1 1.066 0Zm-.61 1.429.001.001-5.25 1.68a.251.251 0 0 0-.174.237V7c0 1.36.275 2.666 1.057 3.859.784 1.194 2.121 2.342 4.366 3.298a.196.196 0 0 0 .154 0c2.245-.957 3.582-2.103 4.366-3.297C13.225 9.666 13.5 8.358 13.5 7V3.48a.25.25 0 0 0-.174-.238l-5.25-1.68a.25.25 0 0 0-.153 0ZM6.78 5.22 8 6.44l1.22-1.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 7.5l1.22 1.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 8.56 6.78 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 7.5 5.72 6.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Z',
  'skip': 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z',
  'sparkle-fill': 'M7.53 1.282a.5.5 0 0 1 .94 0l.478 1.306a7.492 7.492 0 0 0 4.464 4.464l1.305.478a.5.5 0 0 1 0 .94l-1.305.478a7.492 7.492 0 0 0-4.464 4.464l-.478 1.305a.5.5 0 0 1-.94 0l-.478-1.305a7.492 7.492 0 0 0-4.464-4.464L1.282 8.47a.5.5 0 0 1 0-.94l1.306-.478a7.492 7.492 0 0 0 4.464-4.464Z',
  'star': 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z',
  'stop': 'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  'stopwatch': 'M5.75.75A.75.75 0 0 1 6.5 0h3a.75.75 0 0 1 0 1.5h-.75v1l-.001.041a6.724 6.724 0 0 1 3.464 1.435l.007-.006.75-.75a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734l-.75.75-.006.007a6.75 6.75 0 1 1-10.548 0L2.72 5.03l-.75-.75a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l.75.75.007.006A6.72 6.72 0 0 1 7.25 2.541V1.5H6.5a.75.75 0 0 1-.75-.75ZM8 14.5a5.25 5.25 0 1 0-.001-10.501A5.25 5.25 0 0 0 8 14.5Zm.389-6.7 1.33-1.33a.75.75 0 1 1 1.061 1.06L9.45 8.861A1.503 1.503 0 0 1 8 10.75a1.499 1.499 0 1 1 .389-2.95Z',
  'sync': 'M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z',
  'tag': 'M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  'triangle-down': 'm4.427 7.427 3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z',
  'workflow': 'M0 1.75C0 .784.784 0 1.75 0h3.5C6.216 0 7 .784 7 1.75v3.5A1.75 1.75 0 0 1 5.25 7H4v4a1 1 0 0 0 1 1h4v-1.25C9 9.784 9.784 9 10.75 9h3.5c.966 0 1.75.784 1.75 1.75v3.5A1.75 1.75 0 0 1 14.25 16h-3.5A1.75 1.75 0 0 1 9 14.25v-.75H5A2.5 2.5 0 0 1 2.5 11V7h-.75A1.75 1.75 0 0 1 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Zm9 9a.25.25 0 0 0-.25.25v3.5c0 .138.112.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Z',
  'x': 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
  'x-circle-fill': 'M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z',
};
const oc = (n, cls = '', s = 16) => raw(`<svg class="oc ${cls}" width="${s}" height="${s}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="${O[n] || ''}"/></svg>`);

const st = { tab: 'code', prState: 'open', issueState: 'open', wf: '', runs: '' };
const TABS = [['code', 'code', 'קוד'], ['issues', 'issue-opened', 'Issues'], ['pulls', 'git-pull-request', 'Pull requests'], ['actions', 'play', 'Actions'],
  ['security', 'shield', 'אבטחה'], ['insights', 'graph', 'תובנות'], ['settings', 'gear', 'הגדרות']];
const FAIL = ['failure', 'timed_out', 'startup_failure'];
const HEX = /^[0-9a-f]{6}$/i;
// github/linguist languages.yml colours (MIT); anything else is "Other" grey
const LANG = { JavaScript: '#f1e05a', TypeScript: '#3178c6', Luau: '#00a2ff', Lua: '#000080', CSS: '#663399', SCSS: '#c6538c', HTML: '#e34c26', Shell: '#89e051',
  Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584', Dockerfile: '#384d54', Svelte: '#ff3e00', Vue: '#41b883', MDX: '#fcb32c', Makefile: '#427819', PLpgSQL: '#336790' };
const EVENT = { push: 'push', pull_request: 'pull request', schedule: 'לפי שעון', workflow_dispatch: 'ידני', dynamic: 'אוטומטי', dependabot: 'Dependabot' };

const gurl = (u) => (typeof u === 'string' && /^https:\/\/github\.com\//.test(u) ? u : null);
const ext = (u, inner, cls = '') => (gurl(u) ? html`<a class="${cls}" href="${gurl(u)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : html`<span class="${cls}">${inner}</span>`);
const id = (s, cls = '') => html`<bdi class="ltr ${cls}" dir="ltr">${s}</bdi>`;
const ctr = (key, n, cls = '') => (isNum(n) ? html`<span class="gh-ctr ${cls}">${rn(key, n, num(n))}</span>` : '');
const lab = (tone, text, cls = '') => html`<span class="gh-lab gh-lab-${tone} ${cls}">${text}</span>`;
/** A write button in Primer dress; the spec goes through app.act exactly like kit.actBtn. */
const wbtn = (spec, label, { cls = '', ic, title, aria } = {}) =>
  html`<button class="btn btn-sm ${cls}" data-act="app:act" data-aid="${aid(spec)}" ${title ? html`title="${title}"` : ''} ${aria ? html`aria-label="${aria}"` : ''}>${ic ? oc(ic) : ''}<span>${label}</span></button>`;
const secErr = (g, ...keys) => { const k = keys.find((x) => g.errors?.[x]); return k ? html`<p class="gh-err">${oc('alert')}<span>החלק הזה לא נטען: ${g.errors[k]}</span></p>` : ''; };
const initials = (login = '') => (String(login).replace(/\[bot\]$/, '').match(/[A-Za-z0-9]/g) || ['?']).slice(0, 2).join('').toUpperCase();
const avatar = (login, s = 20) => html`<span class="gh-av" style="--s:${s}px" aria-hidden="true">${initials(login)}</span>`;
const dayMonth = (d) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }); };

// ---------------------------------------------------------------- insights (Flash banners, per tab)
const INS_TAB = [[/^(ci-|minutes-|wf-)/, 'actions'], [/^sec-/, 'security'], [/^pr-/, 'pulls']];
const insTab = (i) => (i.id === 'rate-limit' ? '*' : (INS_TAB.find(([re]) => re.test(i.id || '')) || [0, 'code'])[1]);
const FLASH = { bad: ['danger', 'x-circle-fill'], warn: ['warn', 'alert'], good: ['success', 'check-circle-fill'], info: ['info', 'info'] };
// Code tab: only "bad" insights get a full Flash; the rest sit in one compact Box so the repo stays visible.
const onTab = (g, tab) => arr(g.insights).filter((i) => tab === 'code' || insTab(i) === tab || insTab(i) === '*');
function insightBox(g) {
  const list = onTab(g, 'code').filter((i) => i.level !== 'bad');
  if (!list.length) return '';
  return html`<section class="gh-box gh-ins" aria-label="תובנות">
    <div class="gh-box-h"><h3>${oc('pulse')}תובנות</h3>${ctr('gh-ins-n', list.length)}</div>
    <ul class="gh-rows">${list.map((i) => {
      const [tone, ic] = FLASH[i.level] || FLASH.info;
      return html`<li class="gh-row gh-ins-${tone}" data-k="ins-${i.id}"><span class="gh-row-ic">${oc(ic)}</span>
        <div class="gh-row-m"><b class="gh-row-a">${i.title}</b>${i.detail ? html`<p class="gh-row-s" dir="auto">${i.detail}</p>` : ''}</div>
        ${gurl(i.href) ? html`<a class="btn btn-sm btn-ghost" href="${gurl(i.href)}" target="_blank" rel="noopener noreferrer" aria-label="פתיחה ב-GitHub: ${i.title}">${oc('link')}</a>` : ''}</li>`;
    })}</ul></section>`;
}
function flashes(g, tab) {
  const list = onTab(g, tab).filter((i) => tab !== 'code' || i.level === 'bad');
  if (!list.length) return '';
  return html`<div class="gh-flashes">${list.map((i) => {
    const [tone, ic] = FLASH[i.level] || FLASH.info;
    return html`<div class="gh-flash gh-flash-${tone}" role="${i.level === 'bad' ? 'alert' : 'status'}" data-k="ins-${i.id}">${oc(ic)}
      <div class="gh-flash-m"><b>${i.title}</b>${i.detail ? html`<p dir="auto">${i.detail}</p>` : ''}</div>
      ${gurl(i.href) ? html`<a class="btn btn-sm" href="${gurl(i.href)}" target="_blank" rel="noopener noreferrer">ב-GitHub${oc('link')}</a>` : ''}</div>`;
  })}</div>`;
}

// ---------------------------------------------------------------- repo header + UnderlineNav
function header(g, d) {
  const r = g.repo || {}; const c = g.counts || {};
  const live = arr(g.runs).filter((x) => x.status !== 'completed').length;
  const sec = ['dependabot', 'secretScanning', 'codeScanning'].reduce((n, k) => n + (g.security?.[k]?.state === 'ok' ? g.security[k].count || 0 : 0), 0);
  const n = { issues: c.openIssues, pulls: c.openPulls, actions: live || null, security: sec || null };
  return html`<header class="gh-rh">
    <div class="gh-rh-row">
      <h2 class="gh-rh-t">${oc(r.private ? 'lock' : 'repo', 'gh-rh-ic')}<span class="ltr" dir="ltr">${ext(r.owner && `https://github.com/${r.owner}`, r.owner || '—', 'gh-owner')}<span class="gh-sl">/</span>${ext(r.url, html`<strong>${r.name || '—'}</strong>`, 'gh-name')}</span>
        ${r.visibility ? lab('secondary', r.private ? 'Private' : r.visibility === 'internal' ? 'Internal' : 'Public', 'gh-lab-pill') : ''}</h2>
      <div class="gh-rh-a">
        <span class="gh-upd">${d.fetchedAt ? html`נקרא ${ago(d.fetchedAt)}` : ''}</span>
        <button class="btn btn-sm" data-act="app:refresh" aria-label="רענון עכשיו מ-GitHub">${oc('sync')}<span>רענון</span></button>
        ${ext(r.url && `${r.url}/watchers`, html`${oc('eye')}<span>Watch</span>${ctr('gh-w', r.watchers)}`, 'btn btn-sm')}
        ${ext(r.url && `${r.url}/forks`, html`${oc('repo-forked')}<span>Fork</span>${ctr('gh-f', r.forks)}`, 'btn btn-sm')}
        ${ext(r.url && `${r.url}/stargazers`, html`${oc('star')}<span>Star</span>${ctr('gh-s', r.stars)}`, 'btn btn-sm')}
      </div>
    </div>
    <nav class="gh-un" aria-label="לשוניות הריפו">${TABS.map(([k, ic, label]) => html`<button class="gh-ui" data-act="tab" data-tab="${k}" ${st.tab === k ? html`aria-current="page"` : ''}>${oc(ic)}<span>${label}</span>${n[k] ? ctr(`gh-t-${k}`, n[k]) : ''}</button>`)}</nav>
  </header>`;
}

// ---------------------------------------------------------------- Code (overview)
function langBar(g) {
  const l = arr(g.languages); if (!l.length) return html`<p class="gh-muted">${g.errors?.languages ? `לא נטען: ${g.errors.languages}` : 'אין נתוני שפות.'}</p>`;
  return html`<div class="gh-langbar" role="img" aria-label="${l.map((x) => `${x.name} ${num(x.pct, 1)}%`).join(', ')}">${l.map((x) => html`<span style="width:${Math.max(0.5, x.pct)}%;--c:${LANG[x.name] || 'var(--fgColor-muted)'}"></span>`)}</div>
    <ul class="gh-langs">${l.map((x) => html`<li><i style="--c:${LANG[x.name] || 'var(--fgColor-muted)'}"></i><b dir="ltr">${x.name}</b><span>${num(x.pct, 1)}%</span></li>`)}</ul>`;
}
function weeks(g, h = 72) {
  const a = g.activity || {};
  if (a.computing) return html`<div class="gh-computing" role="status"><span class="gh-pulse" aria-hidden="true"></span><div><b>GitHub עדיין מחשב את הסטטיסטיקה</b><p>השרת שלהם החזיר 202 ("מחשב"), וזה קורה אחרי push גדול. הגרף יופיע באחד הרענונים הבאים.</p></div></div>`;
  const w = arr(a.weeks); if (!w.length) return html`<p class="gh-muted">${g.errors?.activity ? `לא נטען: ${g.errors.activity}` : 'אין נתוני פעילות.'}</p>`;
  const max = Math.max(1, ...w); const total = w.reduce((s, x) => s + (x || 0), 0);
  return html`<div class="gh-cols" style="--h:${h}px" role="img" aria-label="${num(total)} קומיטים ב-52 השבועות האחרונים, שיא ${num(max)} בשבוע">${w.map((v, i) => html`<i class="${v ? '' : 'z'}" style="--v:${(v || 0) / max}" title="${num(v || 0)} קומיטים · לפני ${num(w.length - 1 - i)} שבועות"></i>`)}</div>
    <p class="gh-cols-x"><span>לפני שנה</span><span>${num(total)} קומיטים בשנה</span><span>השבוע</span></p>`;
}
function commitRow(c) {
  return html`<li class="gh-row" data-k="c-${c.sha}">${oc('git-commit', 'gh-row-ic gh-muted')}
    <div class="gh-row-m"><div class="gh-row-t">${ext(c.url, c.title, 'gh-row-a')}${c.ai ? lab('done', html`${oc('sparkle-fill', '', 12)}${c.aiTool || 'AI'}`) : ''}</div>
      <div class="gh-row-s">${avatar(c.author, 16)}<b>${c.author || '—'}</b><span>${ago(c.date)}</span></div></div>
    ${ext(c.url, id(c.short || short(c.sha)), 'gh-sha')}</li>`;
}
function branchRow(b, max) {
  const w = (x) => `${Math.min(100, ((x || 0) / max) * 100)}%`;
  return html`<li class="gh-row" data-k="b-${b.name}">${oc('git-branch', 'gh-row-ic gh-muted')}
    <div class="gh-row-m"><div class="gh-row-t">${ext(b.url, id(b.name), 'gh-branch')}${b.isDefault ? lab('secondary', 'ראשי') : ''}${b.protected ? lab('success', html`${oc('shield-check', '', 12)}מוגן`) : ''}${b.stale ? lab('attention', 'ישן') : ''}</div>
      <div class="gh-row-s">${b.title ? html`<span dir="auto" class="gh-trunc">${b.title}</span>` : ''}<span>${ago(b.lastCommitAt)}</span></div></div>
    ${b.isDefault ? html`<span class="gh-muted gh-ab-d">ענף ברירת המחדל</span>` : html`<div class="gh-ab" title="${num(b.behind ?? 0)} מאחורי ${'main'}, ${num(b.ahead ?? 0)} לפני">
      <span class="gh-ab-n"><b>${isNum(b.behind) ? num(b.behind) : '—'}</b> מאחור</span><span class="gh-ab-n"><b>${isNum(b.ahead) ? num(b.ahead) : '—'}</b> לפני</span>
      <span class="gh-ab-b"><i style="width:${w(b.behind)}"></i></span><span class="gh-ab-a"><i style="width:${w(b.ahead)}"></i></span></div>`}</li>`;
}
function tabCode(g) {
  const r = g.repo || {}; const cm = arr(g.commits); const ai = g.aiShare || {}; const last = cm[0];
  const brs = arr(g.branches); const max = Math.max(1, ...brs.map((b) => Math.max(b.ahead || 0, b.behind || 0)));
  const rel0 = arr(g.releases).find((x) => x.latest) || arr(g.releases)[0];
  const tools = Object.entries(ai.tools || {}).sort((a, b) => b[1] - a[1]);
  return html`<div class="gh-lay">
    <div class="gh-main">
      ${flashes(g, 'code')}
      <div class="gh-bar">
        <span class="btn btn-sm gh-brsel">${oc('git-branch')}${id(r.defaultBranch || '—')}${oc('triangle-down')}</span>
        ${ext(r.url && `${r.url}/branches`, html`${oc('git-branch')}<b>${rn('gh-bc', g.branchCount ?? brs.length, num(g.branchCount ?? brs.length))}</b> ענפים`, 'gh-bar-l')}
        ${ext(r.url && `${r.url}/tags`, html`${oc('tag')}<b>${rn('gh-tc', g.tagCount ?? arr(g.tags).length, num(g.tagCount ?? arr(g.tags).length))}</b> תגיות`, 'gh-bar-l')}
        <span class="grow"></span>
        ${ext(r.url, html`${oc('code')}<span>Code</span>`, 'btn btn-sm btn-primary')}
      </div>
      ${insightBox(g)}
      <section class="gh-box" aria-label="קומיטים אחרונים">
        <div class="gh-box-h gh-lc">${last ? html`${avatar(last.author)}<b>${last.author}</b>${ext(last.url, last.title, 'gh-lc-t')}<span class="grow"></span>${ext(last.url, id(last.short || short(last.sha)), 'gh-sha')}<span class="gh-muted">${ago(last.date)}</span>` : html`<span class="gh-muted">אין קומיטים.</span>`}
          ${ext(r.url && `${r.url}/commits/${r.defaultBranch || ''}`, html`${oc('history')}<b>${rn('gh-cc', r.commitCount, num(r.commitCount))}</b> קומיטים`, 'gh-lc-n')}</div>
        ${secErr(g, 'commits')}
        <ul class="gh-rows">${cm.slice(1, 11).map(commitRow)}</ul>
        ${ai.total ? html`<div class="gh-box-f gh-ai">${oc('sparkle-fill', 'gh-done')}<span><b>${rn('gh-ai', Math.round((ai.pct || 0) * 100), pct(ai.pct))}</b> מהקומיטים נכתבו עם AI</span>
          <span class="gh-prog gh-prog-done" role="img" aria-label="${num(ai.ai)} מתוך ${num(ai.total)}"><i style="width:${(ai.pct || 0) * 100}%"></i></span>
          <span class="gh-muted">${num(ai.ai)} מתוך ${num(ai.total)} האחרונים (לפי שורת Co-Authored-By)${tools.length ? ` · ${tools.map(([k, v]) => `${k} ${num(v)}`).join(' · ')}` : ''}</span></div>` : ''}
      </section>
      <section class="gh-box" aria-label="פעילות קומיטים">
        <div class="gh-box-h"><h3>${oc('pulse')}פעילות קומיטים · 52 שבועות</h3></div>
        <div class="gh-box-b">${weeks(g)}</div>
      </section>
      <section class="gh-box" aria-label="ענפים">
        <div class="gh-box-h"><h3>${oc('git-branch')}ענפים</h3><span class="gh-ctr">${num(g.branchCount ?? brs.length)}</span><span class="grow"></span><span class="gh-muted">מאחור / לפני ביחס ל-${id(r.defaultBranch || 'main')}</span></div>
        ${secErr(g, 'branches')}
        <ul class="gh-rows">${brs.slice(0, 12).map((b) => branchRow(b, max))}</ul>
      </section>
    </div>
    <aside class="gh-side" aria-label="על הריפו">
      <section class="gh-about"><h3>About</h3>
        ${r.description ? html`<p class="gh-desc" dir="auto">${r.description}</p>` : html`<p class="gh-muted">אין תיאור.</p>`}
        ${r.homepage && /^https?:\/\//.test(r.homepage) ? html`<a class="gh-home" href="${r.homepage}" target="_blank" rel="noopener noreferrer">${oc('link')}${id(r.homepage.replace(/^https?:\/\//, ''))}</a>` : ''}
        ${arr(r.topics).length ? html`<p class="gh-topics">${arr(r.topics).map((t) => ext(r.url && `https://github.com/topics/${encodeURIComponent(t)}`, id(t), 'gh-topic'))}</p>` : ''}
        <ul class="gh-meta">
          <li>${oc('law')}${r.license ? id(r.license) : 'אין רישיון'}</li>
          <li>${oc('star')}<b>${num(r.stars)}</b> כוכבים</li>
          <li>${oc('eye')}<b>${num(r.watchers)}</b> עוקבים</li>
          <li>${oc('repo-forked')}<b>${num(r.forks)}</b> פיצולים</li>
          <li>${oc('database')}${isNum(r.sizeKb) ? bytes(r.sizeKb * 1024) : '—'} בדיסק</li>
          <li>${oc('clock')}push אחרון ${ago(r.pushedAt)}</li>
          <li>${oc('calendar')}נוצר ${ago(r.createdAt)}</li>
        </ul>
      </section>
      <section class="gh-sbx"><h3>${ext(r.url && `${r.url}/releases`, 'Releases')}${ctr('gh-rc', g.releaseCount ?? arr(g.releases).length)}</h3>
        ${rel0 ? html`<div class="gh-rel">${oc('tag', 'gh-success')}<div>${ext(rel0.url, html`<b dir="auto">${rel0.name || rel0.tag}</b>`)}${rel0.latest ? lab('success', 'Latest') : rel0.prerelease ? lab('attention', 'Pre-release') : ''}<p class="gh-muted">${ago(rel0.publishedAt)}</p></div></div>`
          : html`<p class="gh-muted">אין releases.${arr(g.tags).length ? html` התגית האחרונה: ${ext(g.tags[0].url, id(g.tags[0].name))} ${ago(g.tags[0].date)}` : ''}</p>`}
        ${arr(g.tags).length ? html`<p class="gh-tags">${arr(g.tags).slice(0, 6).map((t) => ext(t.url, html`${oc('tag', '', 12)}${id(t.name)}`, 'gh-tagp'))}</p>` : ''}
      </section>
      <section class="gh-sbx"><h3>שפות</h3>${langBar(g)}</section>
      <section class="gh-sbx"><h3>${ext(r.url && `${r.url}/graphs/contributors`, 'Contributors')}${ctr('gh-ct', arr(g.contributors).length)}</h3>
        ${secErr(g, 'contributors')}
        <ul class="gh-people">${arr(g.contributors).slice(0, 8).map((p) => html`<li>${avatar(p.login, 32)}<div><b dir="ltr">${p.login}</b><span class="gh-muted">${num(p.contributions)} קומיטים${p.bot ? ' · בוט' : ''}</span></div></li>`)}</ul>
      </section>
    </aside>
  </div>`;
}

// ---------------------------------------------------------------- labels (shared by PRs and issues)
function labelChip(g, name, item) {
  const L = arr(g.labels).find((l) => l.name === name); const c = L && HEX.test(L.color || '') ? `#${L.color}` : null;
  return html`<span class="gh-ilab" ${c ? html`style="--lc:${c}"` : ''} title="${L?.description || name}"><span dir="auto">${name}</span>${item ? html`<button class="gh-ilab-x" data-act="app:act" data-aid="${aid(ghx.removeLabel(item, name))}" aria-label="הסרת התווית ${name} מ-#${item.number}">${oc('x', '', 12)}</button>` : ''}</span>`;
}
function labelAdd(g, item) {
  const has = new Set(arr(item.labels)); const free = arr(g.labels).filter((l) => !has.has(l.name));
  if (!free.length) return '';
  return html`<select class="gh-sel" data-change="addlabel" data-n="${item.number}" aria-label="הוספת תווית ל-#${item.number}"><option value="">+ תווית</option>${free.map((l) => html`<option value="${l.name}">${l.name}</option>`)}</select>`;
}
function stateToggle(key, cur, open, closed, icOpen, icClosed) {
  return html`<div class="gh-states" role="group">
    <button class="gh-st" data-act="${key}" data-v="open" aria-pressed="${cur === 'open'}">${oc(icOpen)}<b>${num(open)}</b> פתוחים</button>
    <button class="gh-st" data-act="${key}" data-v="closed" aria-pressed="${cur === 'closed'}">${oc(icClosed)}<b>${num(closed)}</b> סגורים</button></div>`;
}

// ---------------------------------------------------------------- Pull requests
const PR_IC = (p) => (p.state === 'merged' ? ['git-merge', 'gh-done', 'מוזג'] : p.state === 'closed' ? ['git-pull-request-closed', 'gh-danger', 'נסגר']
  : p.draft ? ['git-pull-request-draft', 'gh-muted', 'טיוטה'] : ['git-pull-request', 'gh-success', 'פתוח']);
const CHECKS = { success: ['check', 'gh-success', 'הבדיקות עברו'], failure: ['x', 'gh-danger', 'בדיקות נכשלו'], error: ['x', 'gh-danger', 'בדיקות נכשלו'],
  pending: ['dot-fill', 'gh-attention gh-run', 'בדיקות רצות'], expected: ['dot-fill', 'gh-attention', 'ממתין לבדיקות'] };
const REVIEW = { approved: ['success', 'אושר'], changes_requested: ['danger', 'נדרשים שינויים'], review_required: ['attention', 'ממתין לסקירה'] };
function prRow(g, p) {
  const [ic, tone, word] = PR_IC(p); const ck = CHECKS[p.checks]; const rv = REVIEW[p.review]; const open = p.state === 'open';
  const noMerge = p.draft ? 'טיוטה: אי אפשר למזג עד שהיא מסומנת כמוכנה' : p.mergeable === 'conflicting' ? 'יש קונפליקט עם הענף הראשי: צריך לפתור אותו קודם' : '';
  return html`<li class="gh-row gh-row-i" data-k="pr-${p.number}"><span class="gh-row-ic ${tone}" title="${word}">${oc(ic)}</span>
    <div class="gh-row-m">
      <div class="gh-row-t">${ext(p.url, p.title, 'gh-row-a')}${ck ? html`<span class="gh-ck ${ck[1]}" title="${ck[2]}" aria-label="${ck[2]}">${oc(ck[0])}</span>` : ''}${arr(p.labels).map((l) => labelChip(g, l, open ? p : null))}</div>
      <div class="gh-row-s">${id(`#${p.number}`)}<span>${p.state === 'merged' ? html`מוזג ${ago(p.mergedAt)}` : p.state === 'closed' ? html`נסגר ${ago(p.closedAt)}` : html`נפתח ${ago(p.createdAt)}`} על ידי <b dir="ltr">${p.author || '—'}</b></span>
        ${p.head ? html`<span class="gh-flow" dir="ltr" title="מיזוג של ${p.head} לתוך ${p.base || 'main'}">${id(p.base || 'main', 'gh-branch')}<span class="gh-flow-a">←</span>${id(p.head, 'gh-branch')}</span>` : ''}
        ${isNum(p.additions) ? html`<span class="gh-diff"><b class="gh-success">+${num(p.additions)}</b><b class="gh-danger">−${num(p.deletions)}</b>${isNum(p.files) ? ` · ${num(p.files)} קבצים` : ''}</span>` : ''}</div>
      ${open ? html`<div class="gh-row-x">${rv ? lab(rv[0], html`${oc('code-review', '', 12)}${rv[1]}`) : ''}${p.mergeable === 'conflicting' ? lab('danger', 'קונפליקט') : ''}${p.draft ? lab('secondary', 'טיוטה') : ''}</div>` : ''}
    </div>
    <div class="gh-row-act">${open ? html`
      ${labelAdd(g, p)}
      ${wbtn(gh.approvePr(p), 'אישור', { ic: 'check' })}
      ${noMerge ? html`<button class="btn btn-sm btn-primary" disabled title="${noMerge}" aria-label="מיזוג לא זמין: ${noMerge}">${oc('git-merge')}<span>מיזוג</span></button>` : wbtn(ghx.mergePr(p), 'מיזוג', { cls: 'btn-primary', ic: 'git-merge' })}
      ${wbtn(gh.closePr(p), 'סגירה', { ic: 'git-pull-request-closed', cls: 'gh-btn-dangerish' })}`
      : p.state === 'closed' ? wbtn(ghx.reopenPr(p), 'פתיחה מחדש', { ic: 'git-pull-request' }) : lab('done', html`${oc('git-merge', '', 12)}מוזג`)}</div>
  </li>`;
}
function tabPulls(g) {
  const all = arr(g.pulls); const open = all.filter((p) => p.state === 'open'); const closed = all.filter((p) => p.state !== 'open');
  const list = st.prState === 'open' ? open : closed; const r = g.repo || {};
  return html`${flashes(g, 'pulls')}
    <section class="gh-box" aria-label="Pull requests">
      <div class="gh-box-h">${stateToggle('prstate', st.prState, open.length, closed.length, 'git-pull-request', 'check')}<span class="grow"></span>
        <span class="gh-muted">${num(g.counts?.pulls ?? all.length)} בסך הכול · מיזוג = squash</span>${ext(r.url && `${r.url}/pulls`, html`${oc('link')}ב-GitHub`, 'btn btn-sm')}</div>
      ${list.length ? html`<ul class="gh-rows">${list.map((p) => prRow(g, p))}</ul>`
        : html`<div class="gh-blank">${oc('git-pull-request', '', 24)}<b>${st.prState === 'open' ? 'אין PR פתוחים' : 'אין PR סגורים ברשימה'}</b><p>${st.prState === 'open' ? 'כל העבודה נכנסת ישר לענף הראשי.' : 'הרשימה מציגה את ה-PR האחרונים בלבד.'}</p></div>`}
    </section>`;
}

// ---------------------------------------------------------------- Issues
function issueRow(g, i) {
  const open = i.state === 'open'; const np = i.stateReason === 'not_planned';
  const [ic, tone, word] = open ? ['issue-opened', 'gh-success', 'פתוח'] : np ? ['skip', 'gh-muted', 'נסגר: לא מתוכנן'] : ['issue-closed', 'gh-done', 'נסגר: הושלם'];
  return html`<li class="gh-row gh-row-i" data-k="is-${i.number}"><span class="gh-row-ic ${tone}" title="${word}">${oc(ic)}</span>
    <div class="gh-row-m">
      <div class="gh-row-t">${ext(i.url, i.title, 'gh-row-a')}${arr(i.labels).map((l) => labelChip(g, l, open ? i : null))}</div>
      <div class="gh-row-s">${id(`#${i.number}`)}<span>${open ? html`נפתח ${ago(i.createdAt)}` : html`נסגר ${ago(i.closedAt)}${np ? ' · לא מתוכנן' : ' · הושלם'}`} על ידי <b dir="ltr">${i.author || '—'}</b></span>
        ${i.comments ? html`<span>${oc('comment', '', 12)} ${num(i.comments)}</span>` : ''}</div>
    </div>
    <div class="gh-row-act">${open ? html`${labelAdd(g, i)}${wbtn(ghx.closeIssue(i, 'completed'), 'סגירה: הושלם', { ic: 'issue-closed' })}${wbtn(ghx.closeIssue(i, 'not_planned'), 'לא מתוכנן', { ic: 'skip', cls: 'btn-ghost' })}`
      : wbtn(ghx.reopenIssue(i), 'פתיחה מחדש', { ic: 'issue-reopened' })}</div>
  </li>`;
}
function tabIssues(g) {
  const all = arr(g.issues); const open = all.filter((i) => i.state === 'open'); const closed = all.filter((i) => i.state !== 'open');
  const list = st.issueState === 'open' ? open : closed; const r = g.repo || {};
  if (g.settings && g.settings.has_issues === false) return html`<div class="gh-blank">${oc('issue-opened', '', 24)}<b>Issues כבויים בריפו</b><p>אפשר להדליק אותם בלשונית "הגדרות".</p></div>`;
  return html`${flashes(g, 'issues')}
    <section class="gh-box" aria-label="Issues">
      <div class="gh-box-h">${stateToggle('istate', st.issueState, open.length, closed.length, 'issue-opened', 'check')}<span class="grow"></span>
        <span class="gh-muted">${num(arr(g.labels).length)} תוויות בריפו</span>${ext(r.url && `${r.url}/issues`, html`${oc('link')}ב-GitHub`, 'btn btn-sm')}</div>
      ${list.length ? html`<ul class="gh-rows">${list.map((i) => issueRow(g, i))}</ul>`
        : html`<div class="gh-blank">${oc('issue-opened', '', 24)}<b>${st.issueState === 'open' ? 'אין issues פתוחים' : 'אין issues סגורים ברשימה'}</b></div>`}
    </section>`;
}

// ---------------------------------------------------------------- Actions
function runIcon(x) {
  if (x.status === 'in_progress') return html`<span class="gh-row-ic gh-attention gh-run" title="רץ עכשיו">${oc('dot-fill')}</span>`;
  if (x.status !== 'completed') return html`<span class="gh-row-ic gh-attention" title="בתור">${oc('clock')}</span>`;
  if (x.conclusion === 'success') return html`<span class="gh-row-ic gh-success" title="עבר">${oc('check-circle-fill')}</span>`;
  if (FAIL.includes(x.conclusion)) return html`<span class="gh-row-ic gh-danger" title="נכשל">${oc('x-circle-fill')}</span>`;
  return html`<span class="gh-row-ic gh-muted" title="${x.conclusion === 'cancelled' ? 'בוטל' : x.conclusion || '—'}">${oc(x.conclusion === 'cancelled' ? 'stop' : 'skip')}</span>`;
}
function runRow(x) {
  const running = x.status !== 'completed';
  return html`<li class="gh-row gh-row-i" data-k="run-${x.id}">${runIcon(x)}
    <div class="gh-row-m"><div class="gh-row-t">${ext(x.url, x.title || x.name, 'gh-row-a')}</div>
      <div class="gh-row-s"><b>${x.name}</b>${id(`#${x.id}${x.attempt > 1 ? ` · ניסיון ${x.attempt}` : ''}`)}<span>${EVENT[x.event] || x.event || ''}</span>${x.branch ? id(x.branch, 'gh-branch') : ''}${x.sha ? id(short(x.sha), 'gh-muted') : ''}</div></div>
    <div class="gh-run-t"><span>${oc('calendar', '', 12)}${ago(x.createdAt)}</span><span>${oc('stopwatch', '', 12)}${running ? 'רץ…' : duration(x.durationSec)}</span></div>
    <div class="gh-row-act">${running ? wbtn(gh.cancel(x), 'ביטול', { ic: 'stop', cls: 'gh-btn-dangerish' })
      : html`${FAIL.includes(x.conclusion) ? wbtn(gh.rerunFailed(x), 'רק מה שנכשל', { ic: 'sync' }) : ''}${wbtn(gh.rerun(x), 'הכול מחדש', { ic: 'sync', cls: 'btn-ghost' })}`}</div></li>`;
}
function billing(g) {
  const b = g.billing || {}; if (!isNum(b.minutes) && !b.blocked) return secErr(g, 'billing');
  const f = isNum(b.pct) ? b.pct : null; const tone = b.blocked || (f != null && f >= 1) ? 'danger' : f != null && f >= 0.8 ? 'attention' : 'accent';
  return html`<section class="gh-box" aria-label="דקות Actions">
    <div class="gh-box-h"><h3>${oc('credit-card')}דקות Actions · ${b.period ? id(b.period) : 'החודש'}</h3><span class="grow"></span>${b.plan ? lab('secondary', `תוכנית ${b.plan}`) : ''}</div>
    ${b.blocked ? html`<div class="gh-flash gh-flash-danger gh-flash-in" role="alert">${oc('circle-slash')}<div class="gh-flash-m"><b>CI חסום${b.until ? html` עד ${dayMonth(b.until)}` : ''}${b.untilInferred ? ' (הערכה)' : ''}</b>
      <p>${b.evidence === 'annotation' ? 'GitHub כתב בריצה האחרונה שנגמרו הדקות או שיש בעיית חיוב.' : 'הריצות האחרונות נכשלות תוך שניות בלי להריץ שלב, וזה הסימן של חסימת חיוב.'}${b.since ? html` חסום מאז ${ago(b.since)}.` : ''}${b.untilInferred ? ' התאריך הוא תחילת מחזור החיוב הבא, לא הודעה של GitHub.' : ''}</p></div>
      <a class="btn btn-sm" href="https://github.com/settings/billing" target="_blank" rel="noopener noreferrer">חיוב ב-GitHub${oc('link')}</a></div>` : ''}
    <div class="gh-box-b gh-min">
      <p class="gh-min-n"><b>${rn('gh-min', b.minutes ?? 0, num(b.minutes))}</b><span>מתוך ${num(b.includedMinutes)} דקות${b.includedInferred ? ' (המכסה של התוכנית, הערכה)' : ''}</span><span class="grow"></span><b class="gh-${tone === 'accent' ? 'fg' : tone}">${f == null ? '—' : pct(f)}</b></p>
      <span class="gh-prog gh-prog-${tone}" role="img" aria-label="${f == null ? 'לא ידוע' : pct(f)}"><i style="width:${Math.min(100, (f || 0) * 100)}%"></i></span>
      <ul class="gh-kv">
        <li><span>עלות החודש</span><b>${isNum(b.amount) ? `$${num(b.amount, 2)}` : '—'}</b></li>
        <li><span>אחסון</span><b>${isNum(b.storageGbH) ? `${num(b.storageGbH, 1)} GB-שעות` : '—'}</b></li>
        <li><span>Cache של Actions</span><b>${isNum(g.cache?.bytes) ? html`${bytes(g.cache.bytes)} · ${num(g.cache.count)} פריטים` : '—'}</b></li>
        <li><span>רצף כישלונות</span><b class="${g.ci?.streak ? 'gh-danger' : ''}">${num(g.ci?.streak ?? 0)}</b></li>
        <li><span>ריצה ירוקה אחרונה</span><b>${g.ci?.lastOk ? ago(g.ci.lastOk) : '—'}</b></li>
      </ul>
    </div></section>`;
}
function tabActions(g) {
  const wfs = arr(g.workflows); const w = wfs.find((x) => String(x.id) === st.wf);
  let runs = arr(g.runs).filter((x) => !w || String(x.workflowId) === String(w.id));
  const nBad = runs.filter((x) => FAIL.includes(x.conclusion)).length; const nLive = runs.filter((x) => x.status !== 'completed').length;
  runs = runs.filter((x) => !st.runs || (st.runs === 'bad' ? FAIL.includes(x.conclusion) : x.status !== 'completed'));
  const r = g.repo || {};
  return html`<div class="gh-lay gh-lay-s">
    <nav class="gh-nl" aria-label="Workflows">
      <h3>Actions</h3>
      <button class="gh-nl-i" data-act="wf" data-v="" ${!w ? html`aria-current="page"` : ''}>${oc('workflow')}<span>כל ה-workflows</span></button>
      <p class="gh-nl-g">Workflows</p>
      ${wfs.map((x) => html`<button class="gh-nl-i ${x.state !== 'active' ? 'is-off' : ''}" data-act="wf" data-v="${x.id}" ${w?.id === x.id ? html`aria-current="page"` : ''} data-k="wf-${x.id}">
        ${oc(x.lastConclusion === 'success' ? 'check-circle-fill' : FAIL.includes(x.lastConclusion) ? 'x-circle-fill' : 'workflow', x.lastConclusion === 'success' ? 'gh-success' : FAIL.includes(x.lastConclusion) ? 'gh-danger' : 'gh-muted')}
        <span dir="auto">${x.name}</span>${x.state !== 'active' ? lab('secondary', 'מושבת') : isNum(x.passRate) ? html`<span class="gh-ctr">${pct(x.passRate)}</span>` : ''}</button>`)}
      ${secErr(g, 'workflows')}
    </nav>
    <div class="gh-main">
      ${flashes(g, 'actions')}
      ${billing(g)}
      ${w ? html`<section class="gh-box gh-wf" aria-label="${w.name}">
        <div class="gh-box-h"><h3>${oc('workflow')}<span dir="auto">${w.name}</span></h3>${ext(w.url, id(w.path || ''), 'gh-muted gh-mono')}<span class="grow"></span>
          ${wbtn(gh.dispatch(w), 'Run workflow', { ic: 'play', cls: 'btn-primary', aria: `הפעלה ידנית של ${w.name}` })}${swBtn(gh.wfToggle(w), w.state === 'active', `${w.name} פעיל`)}</div>
        <div class="gh-box-b gh-wf-b">
          <div><span class="gh-muted">עברו</span><b class="${isNum(w.passRate) && w.passRate < 0.5 ? 'gh-danger' : 'gh-success'}">${isNum(w.passRate) ? rn(`gh-pr-${w.id}`, Math.round(w.passRate * 100), pct(w.passRate)) : '—'}</b><span class="gh-muted">מתוך ${num(w.runs)} ריצות</span></div>
          <div class="gh-wf-sp"><span class="gh-muted">משך ריצה (שניות), מהישנה לחדשה</span>${arr(w.durations).length > 1 ? spark(arr(w.durations).slice().reverse(), { w: 240, h: 40, cls: isNum(w.passRate) && w.passRate < 0.5 ? 'bad' : '', label: `${w.name}: משך ריצה` }) : html`<span class="gh-muted">אין מספיק ריצות.</span>`}</div>
        </div></section>` : ''}
      <section class="gh-box" aria-label="ריצות">
        <div class="gh-box-h"><h3>${rn('gh-rn', runs.length, num(runs.length))} ריצות${w ? html` של <span dir="auto">${w.name}</span>` : ''}</h3><span class="grow"></span>
          <div class="gh-seg" role="group" aria-label="סינון ריצות">${[['', 'הכול', null], ['bad', 'נכשלו', nBad], ['live', 'רצות', nLive]].map(([k, l, n]) => html`<button class="gh-seg-b" data-act="runs" data-v="${k}" aria-pressed="${st.runs === k}">${l}${n ? html` <span class="gh-ctr">${num(n)}</span>` : ''}</button>`)}</div>
          ${ext(r.url && `${r.url}/actions`, html`${oc('link')}ב-GitHub`, 'btn btn-sm')}</div>
        ${secErr(g, 'runs')}
        ${runs.length ? html`<ul class="gh-rows">${runs.slice(0, 25).map(runRow)}</ul>` : html`<div class="gh-blank">${oc('play', '', 24)}<b>אין ריצות בסינון הזה</b></div>`}
      </section>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Security (read-only)
const SEC = [['dependabot', 'Dependabot alerts', 'dependabot', 'security/dependabot', 'עדכוני תלויות עם חולשות ידועות'],
  ['codeScanning', 'Code scanning', 'codescan', 'security/code-scanning', 'CodeQL וכלים אחרים שסורקים את הקוד'],
  ['secretScanning', 'Secret scanning', 'key', 'security/secret-scanning', 'מפתחות וסיסמאות שנדחפו לקוד בטעות']];
function secState(s = {}) {
  if (s.state === 'ok') return s.count ? [s.severe ? 'danger' : 'attention', `${num(s.count)}${s.more ? '+' : ''} התראות פתוחות${s.severe ? ` · ${num(s.severe)} חמורות` : ''}`, s.severe ? 'shield-x' : 'alert']
    : ['success', '0 התראות פתוחות', 'shield-check'];
  if (s.state === 'disabled') return ['secondary', 'כבוי בריפו', 'circle-slash'];
  if (s.state === 'no-permission') return ['attention', 'אין הרשאה לקרוא', 'lock'];
  if (s.state === 'unavailable') return ['secondary', 'לא זמין בתוכנית הזו', 'circle-slash'];
  return ['danger', 'שגיאה בקריאה', 'alert'];
}
function tabSecurity(g) {
  const r = g.repo || {};
  return html`${flashes(g, 'security')}
    <section class="gh-box" aria-label="אבטחה">
      <div class="gh-box-h"><h3>${oc('shield')}סקירת אבטחה</h3><span class="grow"></span>${ext(r.url && `${r.url}/security`, html`${oc('link')}ב-GitHub`, 'btn btn-sm')}</div>
      <ul class="gh-rows">${SEC.map(([k, name, ic, path, what]) => { const s = g.security?.[k] || { state: 'error' }; const [tone, text, sic] = secState(s);
        return html`<li class="gh-row gh-row-i" data-k="sec-${k}"><span class="gh-row-ic gh-muted">${oc(ic)}</span>
          <div class="gh-row-m"><div class="gh-row-t"><b>${name}</b>${lab(tone, html`${oc(sic, '', 12)}${text}`)}</div><div class="gh-row-s"><span>${what}</span>${s.reason ? html`<span dir="auto">${s.reason}</span>` : ''}</div></div>
          ${ext(r.url && `${r.url}/${s.state === 'disabled' ? 'settings/security_analysis' : path}`, html`${s.state === 'disabled' ? 'להדליק ב-GitHub' : 'לפתוח'}${oc('link')}`, 'btn btn-sm')}</li>`; })}</ul>
      <p class="gh-box-f gh-muted">${oc('info')}הדף הזה רק קורא. הדלקה או כיבוי של סריקות, הגנת ענפים ונראות הריפו נעשים ב-GitHub עצמו.</p>
    </section>`;
}

// ---------------------------------------------------------------- Insights
function dayBars(days, key, label) {
  const d = arr(days); if (!d.length) return html`<p class="gh-muted">אין נתונים.</p>`;
  const max = Math.max(1, ...d.map((x) => x[key] || 0));
  return html`<div class="gh-cols gh-cols-d" style="--h:96px" role="img" aria-label="${label}">${d.map((x) => html`<i class="${x[key] ? '' : 'z'}" style="--v:${(x[key] || 0) / max}" title="${new Date(x.date).toLocaleDateString('he-IL')}: ${num(x[key] || 0)}"></i>`)}</div>`;
}
function tabInsights(g) {
  const t = g.traffic || {}; const ai = g.aiShare || {}; const c = g.counts || {};
  const box = (ic, title, body, extra = '') => html`<section class="gh-box"><div class="gh-box-h"><h3>${oc(ic)}${title}</h3><span class="grow"></span>${extra}</div><div class="gh-box-b">${body}</div></section>`;
  const tr = (k, name) => { const x = t[k] || {}; return box(k === 'views' ? 'eye' : 'repo-forked', name,
    html`${secErr(g, k)}<p class="gh-big"><b>${rn(`gh-${k}`, x.count ?? 0, num(x.count))}</b><span>${num(x.uniques)} ייחודיים · 14 יום</span></p>${dayBars(x.days, 'count', `${name} ב-14 הימים האחרונים`)}`); };
  return html`<div class="gh-g2">
      ${tr('views', 'צפיות')}${tr('clones', 'שכפולים (clone)')}
    </div>
    <div class="gh-g2">
      ${box('pulse', 'פעילות קומיטים · 52 שבועות', weeks(g, 120))}
      ${box('people', 'Pulse', html`<ul class="gh-kv gh-kv-l">
        <li><span>PR פתוחים / בסך הכול</span><b>${num(c.openPulls)} / ${num(c.pulls)}</b></li>
        <li><span>Issues פתוחים / בסך הכול</span><b>${num(c.openIssues)} / ${num(c.issues)}</b></li>
        <li><span>קומיטים בענף הראשי</span><b>${num(g.repo?.commitCount)}</b></li>
        <li><span>קומיטים עם AI (100 האחרונים)</span><b>${pct(ai.pct)}</b></li>
        ${Object.entries(ai.tools || {}).map(([k, v]) => html`<li><span dir="ltr">${k}</span><b>${num(v)}</b></li>`)}
        <li><span>Contributors</span><b>${num(arr(g.contributors).length)}</b></li></ul>`)}
    </div>
    ${box('link', 'מאיפה מגיעים (referrers)', arr(t.referrers).length ? html`<table class="gh-tbl"><thead><tr><th>מקור</th><th>צפיות</th><th>ייחודיים</th></tr></thead>
      <tbody>${arr(t.referrers).map((x) => html`<tr data-k="ref-${x.referrer}"><td>${id(x.referrer)}</td><td>${num(x.count)}</td><td>${num(x.uniques)}</td></tr>`)}</tbody></table>` : html`${secErr(g, 'referrers')}<p class="gh-muted">אין הפניות ב-14 הימים האחרונים.</p>`)}`;
}

// ---------------------------------------------------------------- Settings
function tabSettings(g) {
  const r = g.repo || {}; const s = g.settings || {};
  return html`<div class="gh-lay gh-lay-s">
    <nav class="gh-nl" aria-label="הגדרות"><h3>הגדרות</h3>
      <span class="gh-nl-i" aria-current="page">${oc('gear')}<span>כללי</span></span>
      <span class="gh-nl-i">${oc('play')}<span>Actions</span></span>
      ${ext(r.url && `${r.url}/settings/branches`, html`${oc('git-branch')}<span>ענפים</span>${oc('link', 'gh-muted', 12)}`, 'gh-nl-i')}
      ${ext(r.url && `${r.url}/settings/security_analysis`, html`${oc('shield')}<span>אבטחה</span>${oc('link', 'gh-muted', 12)}`, 'gh-nl-i')}
    </nav>
    <div class="gh-main">
      <div class="gh-flash gh-flash-info" role="status">${oc('info')}<div class="gh-flash-m"><b>כל מתג פותח חלון אישור</b><p>שמות, נראות (Private/Public), הגנת ענפים, מחיקות וסריקות אבטחה לא משתנים מכאן. הם נשארים ב-GitHub.</p></div>
        ${ext(r.url && `${r.url}/settings`, html`כל ההגדרות${oc('link')}`, 'btn btn-sm')}</div>
      <section class="gh-box" aria-label="הגדרות הריפו"><div class="gh-box-h"><h3>כללי</h3>${r.admin === false ? lab('attention', 'אין הרשאת admin: השינויים ייכשלו') : ''}</div>
        <ul class="gh-rows">${Object.keys(s).length ? Object.entries(s).map(([k, v]) => html`<li class="gh-row gh-set" data-k="set-${k}"><div class="gh-row-m"><b>${GH_SETTINGS[k]?.[0] || k}</b><p class="gh-muted">${GH_SETTINGS[k]?.[1] || ''}</p><code class="gh-mono gh-muted" dir="ltr">${k}</code></div>${swBtn(gh.setting(k, v), v, GH_SETTINGS[k]?.[0] || k)}</li>`)
          : html`<li class="gh-row"><span class="gh-muted">אין הגדרות לקריאה.</span></li>`}</ul></section>
      <section class="gh-box" aria-label="Workflows"><div class="gh-box-h"><h3>${oc('play')}Workflows</h3><span class="gh-muted">מתג = פעיל / מושבת</span></div>
        <ul class="gh-rows">${arr(g.workflows).map((w) => html`<li class="gh-row gh-set" data-k="swf-${w.id}"><div class="gh-row-m"><b dir="auto">${w.name}</b><code class="gh-mono gh-muted" dir="ltr">${w.path || ''}</code></div>${swBtn(gh.wfToggle(w), w.state === 'active', `${w.name} פעיל`)}</li>`)}</ul></section>
    </div>
  </div>`;
}

const BODY = { code: tabCode, issues: tabIssues, pulls: tabPulls, actions: tabActions, security: tabSecurity, insights: tabInsights, settings: tabSettings };

export default {
  id: 'github', title: 'GitHub', nav: 'GitHub', brand: 'github', needs: ['github'],
  sub: 'הריפו כמו ב-github.com: קוד, PR, issues, CI, אבטחה והגדרות',
  links: (d) => [{ label: 'הריפו', url: d.github?.repo?.url }, { label: 'Actions', url: d.github?.repo?.url && `${d.github.repo.url}/actions` }],
  render(d) {
    const g = d.github || {};
    if (!BODY[st.tab]) st.tab = 'code';
    return html`${header(g, d)}<div class="gh-tab" data-tab="${st.tab}" data-k="tab-${st.tab}">${BODY[st.tab](g)}</div>`;
  },
  actions: {
    tab(el, ctx) { if (st.tab === el.dataset.tab) return; st.tab = el.dataset.tab; ctx.rerender(); ctx.root.querySelector(`.gh-ui[data-tab="${st.tab}"]`)?.focus({ preventScroll: true }); },
    prstate(el, ctx) { st.prState = el.dataset.v; ctx.rerender(); },
    istate(el, ctx) { st.issueState = el.dataset.v; ctx.rerender(); },
    wf(el, ctx) { st.wf = el.dataset.v; ctx.rerender(); },
    runs(el, ctx) { st.runs = el.dataset.v; ctx.rerender(); },
    addlabel(el, ctx) {
      const label = el.value; el.value = ''; if (!label) return;
      const g = ctx.data?.github || {}; const n = Number(el.dataset.n);
      const item = [...arr(g.pulls), ...arr(g.issues)].find((x) => x.number === n);
      if (item) ctx.act(ghx.addLabel(item, label));
    },
  },
};
