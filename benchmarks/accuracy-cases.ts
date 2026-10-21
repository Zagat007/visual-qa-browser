/** Independently labelled signals, including ordinary layouts that resemble defects. */
export type Signal = 'horizontal-overflow' | 'zero-size-interactive' | 'clipping-candidate' |
  'broken-img' | 'duplicate-img-url' | 'typography-h2-variant' | 'crop-candidate';
export interface AccuracyCase { id: string; signal: Signal; expected: boolean; html: string; rationale: string }

const svg = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${color}"/></svg>`)}`;
const red = svg('red');
const blue = svg('blue');
const page = (body: string, css = '') => `<!doctype html><html lang="en"><head><style>*{box-sizing:border-box}body{margin:0;font:16px Arial}${css}</style></head><body><main>${body}</main></body></html>`;

export const accuracyCases: readonly AccuracyCase[] = [
  { id: 'overflow-fixed-wide', signal: 'horizontal-overflow', expected: true, html: page('<div style="width:650px;height:20px">wide</div>'), rationale: '650px content in a 390px viewport' },
  { id: 'overflow-positioned', signal: 'horizontal-overflow', expected: true, html: page('<div style="position:absolute;left:380px;width:100px;height:20px">wide</div>'), rationale: 'Positioned content extends outside viewport' },
  { id: 'overflow-clipped', signal: 'horizontal-overflow', expected: false, html: page('<div style="width:300px;overflow:hidden"><div style="width:600px;height:20px"></div></div>'), rationale: 'Wide child clipped without page overflow' },
  { id: 'overflow-carousel', signal: 'horizontal-overflow', expected: false, html: page('<div class="carousel" style="width:300px;overflow-x:auto;white-space:nowrap"><span style="display:inline-block;width:900px">slides</span></div>'), rationale: 'Intentional local horizontal scroller' },
  { id: 'overflow-in-bounds', signal: 'horizontal-overflow', expected: false, html: page('<div style="width:100%;height:20px">fits</div>'), rationale: 'Normal responsive width' },

  { id: 'tiny-button', signal: 'zero-size-interactive', expected: true, html: page('<button style="width:1px;height:1px;padding:0;border:0" aria-label="tiny"></button>'), rationale: 'Active button has 1x1px geometry' },
  { id: 'tiny-link', signal: 'zero-size-interactive', expected: true, html: page('<a href="/" style="display:block;width:1px;height:1px" aria-label="tiny"></a>'), rationale: 'Active link has 1x1px geometry' },
  { id: 'tiny-hidden', signal: 'zero-size-interactive', expected: false, html: page('<div hidden><button style="width:1px;height:1px;padding:0"></button></div>'), rationale: 'Control is hidden' },
  { id: 'tiny-inert', signal: 'zero-size-interactive', expected: false, html: page('<div inert><button style="width:1px;height:1px;padding:0"></button></div>'), rationale: 'Control is inert' },
  { id: 'tiny-disabled', signal: 'zero-size-interactive', expected: false, html: page('<button disabled style="width:1px;height:1px;padding:0"></button>'), rationale: 'Disabled control is not active' },
  { id: 'tiny-disabled-fieldset', signal: 'zero-size-interactive', expected: false, html: page('<fieldset disabled><button style="width:1px;height:1px;padding:0;border:0" aria-label="disabled"></button></fieldset>'), rationale: 'Fieldset disables descendant button without a disabled attribute' },
  { id: 'tiny-screen-reader-only', signal: 'zero-size-interactive', expected: false, html: page('<button class="sr-only" aria-label="Skip">Skip</button>', '.sr-only{position:absolute;width:1px;height:1px;padding:0;border:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}'), rationale: 'Intentional screen-reader-only control' },
  { id: 'tiny-focusable-skip-link', signal: 'zero-size-interactive', expected: false, html: page('<a class="skip" href="#main">Skip to content</a><div id="main">Content</div>', '.skip{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.skip:focus{width:auto;height:auto;clip-path:none}'), rationale: 'Skip link becomes visible on keyboard focus' },
  { id: 'tiny-normal', signal: 'zero-size-interactive', expected: false, html: page('<button style="width:44px;height:44px">OK</button>'), rationale: 'Ordinary 44px button' },

  { id: 'clip-horizontal', signal: 'clipping-candidate', expected: true, html: page('<div style="position:relative;width:100px;height:50px;overflow:hidden"><button style="position:absolute;left:80px;top:5px;width:80px;height:30px">cut</button></div>'), rationale: 'Active control cut horizontally' },
  { id: 'clip-vertical', signal: 'clipping-candidate', expected: true, html: page('<div style="position:relative;width:100px;height:50px;overflow:hidden"><button style="position:absolute;left:5px;top:40px;width:80px;height:30px">cut</button></div>'), rationale: 'Active control cut vertically' },
  { id: 'clip-carousel', signal: 'clipping-candidate', expected: false, html: page('<div class="carousel" style="width:150px;overflow:hidden;white-space:nowrap"><button style="width:120px;height:35px">A</button><button style="width:120px;height:35px">B</button></div>'), rationale: 'Intentional horizontal carousel' },
  { id: 'clip-hidden-control', signal: 'clipping-candidate', expected: false, html: page('<div style="position:relative;width:100px;height:50px;overflow:hidden"><button hidden style="position:absolute;left:80px;width:80px">hidden</button></div>'), rationale: 'Clipped control is hidden' },
  { id: 'clip-noninteractive', signal: 'clipping-candidate', expected: false, html: page('<div style="width:100px;height:50px;overflow:hidden"><div style="width:300px;height:20px">decorative</div></div>'), rationale: 'No active control is cut' },
  { id: 'clip-fits', signal: 'clipping-candidate', expected: false, html: page('<div style="width:200px;height:50px;overflow:hidden"><button style="width:80px;height:30px">fits</button></div>'), rationale: 'Control fits within clipping container' },

  { id: 'image-invalid-png', signal: 'broken-img', expected: true, html: page('<img src="data:image/png;base64,not-a-png" alt="broken">'), rationale: 'Completed img decode failed' },
  { id: 'image-invalid-svg', signal: 'broken-img', expected: true, html: page('<img src="data:image/svg+xml,%3Csvg" alt="broken">'), rationale: 'Malformed SVG' },
  { id: 'image-valid', signal: 'broken-img', expected: false, html: page(`<img src="${red}" alt="valid">`), rationale: 'Loaded image' },
  { id: 'image-absent', signal: 'broken-img', expected: false, html: page('<div role="img" aria-label="illustration"></div>'), rationale: 'No img resource to break' },

  { id: 'duplicate-same-src', signal: 'duplicate-img-url', expected: true, html: page(`<img src="${red}" alt="one"><img src="${red}" alt="two">`), rationale: 'Same resource URL twice' },
  { id: 'duplicate-three', signal: 'duplicate-img-url', expected: true, html: page(`<img src="${blue}" alt="one"><img src="${blue}" alt="two"><img src="${blue}" alt="three">`), rationale: 'Same resource URL three times' },
  { id: 'duplicate-different', signal: 'duplicate-img-url', expected: false, html: page(`<img src="${red}" alt="one"><img src="${blue}" alt="two">`), rationale: 'Two different resource URLs' },
  { id: 'duplicate-one', signal: 'duplicate-img-url', expected: false, html: page(`<img src="${red}" alt="one">`), rationale: 'Single image URL' },

  { id: 'type-size', signal: 'typography-h2-variant', expected: true, html: page('<h2 style="font-size:24px">A</h2><h2 style="font-size:38px">B</h2>'), rationale: 'Two H2 font sizes' },
  { id: 'type-weight', signal: 'typography-h2-variant', expected: true, html: page('<h2 style="font-weight:400">A</h2><h2 style="font-weight:800">B</h2>'), rationale: 'Two H2 font weights' },
  { id: 'type-alignment', signal: 'typography-h2-variant', expected: false, html: page('<h2 style="text-align:left">A</h2><h2 style="text-align:center">B</h2>'), rationale: 'Alignment is composition, not token' },
  { id: 'type-hidden', signal: 'typography-h2-variant', expected: false, html: page('<h2>A</h2><h2 style="display:none;font-size:40px">B</h2>'), rationale: 'Hidden H2 is not a rendered variant' },

  { id: 'crop-cover', signal: 'crop-candidate', expected: true, html: page(`<img src="${red}" alt="crop" style="width:120px;height:120px;object-fit:cover">`), rationale: '2:1 resource in 1:1 cover frame; candidate only' },
  { id: 'crop-contain', signal: 'crop-candidate', expected: false, html: page(`<img src="${red}" alt="contain" style="width:120px;height:120px;object-fit:contain">`), rationale: 'Contain mode preserves full image' },
  { id: 'crop-matching', signal: 'crop-candidate', expected: false, html: page(`<img src="${red}" alt="matching" style="width:200px;height:100px;object-fit:cover">`), rationale: 'Matching aspect ratio' },
] as const;
