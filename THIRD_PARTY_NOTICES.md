# Third-party notices

The Rhykaris Master Map builds on the open-source components below. Their licenses apply to them, not to this repository's own code ([MIT](LICENSE)) or world content ([CC BY-NC-ND 4.0](LICENSE-CONTENT.md)).

## Leaflet 1.9.4 — BSD-2-Clause

- **What is included:** `vendor/leaflet/leaflet.css`, which `scripts/build_index.py` minifies and inlines into `index.html`.
- **What is not included:** the Leaflet JavaScript library. `index.html` loads it at runtime from a public CDN (cdnjs, with unpkg and jsDelivr as fallbacks).
- Project: <https://leafletjs.com/> · <https://github.com/Leaflet/Leaflet>

```text
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## three.js r160 (0.160.0) — MIT

- **What is included:** `vendor/three/three.module.min.js` (the unmodified ES-module build from the npm package `three@0.160.0`) and `vendor/three/LICENSE`. It is **not** inlined into `index.html`: the 3D views load it lazily, only when a visitor enters 3D, from jsDelivr (exact npm bytes), then cdnjs and unpkg, and finally from this vendored copy. Every source is verified against a pinned Subresource-Integrity hash (`sha384`, computed from the vendored file by `scripts/build_index.py`) before it is run.
- Project: <https://threejs.org/> · <https://github.com/mrdoob/three.js>

```text
The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Fonts — SIL Open Font License 1.1

Loaded at runtime from Google Fonts (`fonts.googleapis.com`). **Not redistributed** in this repository.

| Font | Copyright |
|---|---|
| Cinzel | Copyright 2020 The Cinzel Project Authors (<https://github.com/NDISCOVER/Cinzel>) |
| Cormorant Garamond | Copyright 2015 The Cormorant Project Authors (<https://github.com/CatharsisFonts/Cormorant>) |
| IBM Plex Sans | Copyright 2019 IBM Corp. |
| IBM Plex Mono | Copyright 2017 IBM Corp. |

License text and FAQ: <https://openfontlicense.org/>

## Test tooling (development only)

The suites in `tests/` use Playwright (`playwright-core`, Apache-2.0), `pixelmatch` (ISC), `pngjs` (MIT) and the npm copies of Leaflet and three.js to serve the CDN requests offline. None of it is shipped with the viewer; install it with `npm install` in `tests/`.

## Python pipeline dependencies

The scripts in `src/` use NumPy, SciPy, Numba, Pillow and scikit-image. They are **not redistributed** here; install them separately (each under its own license).
