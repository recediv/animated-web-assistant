export const ART_IDS = ['electric-sun', 'moon-guardian', 'forest-spirit', 'crimson-fox', 'sky-dragon', 'star-witch'];

const palettes = {
  'electric-sun': ['#efd4ab', '#d59d6b', '#fff1d7', '#765746', 'ЛИСТОЛЕСЬЕ'],
  'moon-guardian': ['#b5b9ec', '#687bba', '#e4e6fb', '#3f477b', 'ЛУНАРА'],
  'forest-spirit': ['#bad6a5', '#618c74', '#e4efc8', '#324d3e', 'ЛИСТОЛЕСЬЕ'],
  'crimson-fox': ['#efa79a', '#ca655b', '#ffded0', '#683a3c', 'ИСКРОВЕЛЬ'],
  'sky-dragon': ['#a8d5e6', '#4c93b2', '#deeff7', '#255473', 'АЭРОЛИН'],
  'star-witch': ['#e5b5d0', '#b67fab', '#fde2ef', '#664366', 'ЛУНАРА'],
};

function star(x, y, size = 8, color = '#fff8dc') {
  return `<path d="M${x} ${y-size} Q${x+2} ${y-2} ${x+size} ${y} Q${x+2} ${y+2} ${x} ${y+size} Q${x-2} ${y+2} ${x-size} ${y} Q${x-2} ${y-2} ${x} ${y-size}Z" fill="${color}"/>`;
}

function commonBackground(id, palette) {
  const [light, dark, cream, ink, world] = palette;
  const dots = Array.from({ length: 10 }, (_, row) => Array.from({ length: 9 }, (_, col) => `<circle cx="${26 + col * 49}" cy="${18 + row * 59}" r="1.25" fill="${cream}" opacity=".24"/>`).join('')).join('');
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${cream}"/><stop offset="1" stop-color="${light}"/></linearGradient>
    <linearGradient id="cloth" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${ink}"/></linearGradient>
    <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff2df"/><stop offset="1" stop-color="#efc9b5"/></linearGradient>
    <pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#fff" opacity=".12"/><circle cx="5" cy="5" r=".45" fill="#000" opacity=".035"/></pattern>
  </defs>
  <rect width="440" height="560" fill="url(#bg)"/>
  <path d="M-25 412 C67 350 321 501 472 356 L470 568 L-25 568Z" fill="${ink}" opacity=".1"/>
  <circle cx="220" cy="243" r="173" fill="${cream}" opacity=".44"/>
  <circle cx="220" cy="243" r="155" fill="none" stroke="${cream}" stroke-width="1.3" opacity=".6"/>
  <circle cx="220" cy="243" r="185" fill="none" stroke="${cream}" stroke-width="1.3" opacity=".32"/>
  <path d="M-20 129 Q190 97 467 250 M-20 134 Q189 102 467 255" fill="none" stroke="${cream}" opacity=".26"/>
  ${dots}
  <text x="24" y="33" font-family="Arial,sans-serif" font-size="10" letter-spacing="3" fill="${ink}" opacity=".72">ЛУМОЛИ · ХРОНИКИ МИРОВ</text>
  <text x="415" y="72" writing-mode="vertical-rl" font-family="sans-serif" font-size="12" letter-spacing="3" fill="${ink}" opacity=".48">${world}</text>
  <path d="M23 77 V64 H36 M404 64 H417 V77 M23 480 V495 H36 M404 495 H417 V480" fill="none" stroke="${cream}" stroke-width="1.5" opacity=".8"/>
  ${star(63, 140, 8, cream)}${star(374, 329, 10, cream)}${star(350, 99, 5, cream)}${star(48, 356, 4, cream)}
  <text x="26" y="526" font-family="Arial,sans-serif" font-size="10" letter-spacing="2.5" fill="${ink}" opacity=".65">ХРОНИКА / ${String(ART_IDS.indexOf(id)+1).padStart(2, '0')}</text>`;
}

function solarTraveler() {
  // An original human portrait shares the quiet framing of the neighboring cards.
  return `<defs>
    <linearGradient id="traveler-hair" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#e6c18b"/><stop offset="1" stop-color="#b98259"/></linearGradient>
    <linearGradient id="traveler-cloak" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a3ae8a"/><stop offset="1" stop-color="#707e68"/></linearGradient>
  </defs>
  <g stroke="#7d6250" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="300" cy="108" r="27" fill="#fff0c5" stroke="none" opacity=".85"/>
    <circle cx="300" cy="108" r="20" fill="none" stroke="#ddb981" stroke-width="1.2" opacity=".6"/>
    <path d="M143 337 Q99 356 85 423 L78 488 Q218 519 358 488 L349 420 Q337 366 291 340Z" fill="url(#traveler-cloak)"/>
    <path d="M171 364 Q152 424 156 499 Q220 510 289 496 Q286 428 271 367Z" fill="#8a7060"/>
    <path d="M143 337 Q110 369 96 455 L155 430 L182 368 M291 340 Q326 370 343 457 L286 431 L266 369" fill="#b9bea0"/>
    <path d="M132 412 L115 473 M315 413 L331 473 M148 461 L142 490 M296 457 L306 490" fill="none" stroke="#dae0c4" stroke-width="1.6" opacity=".65"/>
    <path d="M146 233 Q132 276 151 313 L172 317 L173 246 M286 230 Q311 272 291 318 L272 312 L272 246" fill="#b98259"/>
    <path d="M203 317 L201 348 L182 361 Q219 398 257 361 L238 345 L237 315Z" fill="url(#skin)"/>
    <path d="M151 259 Q136 248 137 269 Q137 291 155 296 M289 258 Q305 247 304 269 Q304 290 286 296" fill="url(#skin)"/>
    <path d="M151 233 C156 179 274 166 290 231 L285 291 Q273 330 222 347 Q175 333 156 291Z" fill="url(#skin)"/>
    <path d="M144 263 Q127 235 132 204 Q138 174 169 157 Q155 148 147 150 Q172 134 202 145 Q217 130 243 141 Q280 137 301 170 Q321 202 304 251 L288 266 L280 233 Q262 220 248 194 Q234 221 207 235 Q214 210 203 195 Q183 229 154 238Z" fill="url(#traveler-hair)"/>
    <path d="M148 194 Q160 172 190 165 M180 206 Q201 184 210 155 M224 171 Q245 171 268 196 M279 173 Q298 196 296 226" fill="none" stroke="#f3d7ab" stroke-width="1.8"/>
    <path d="M173 251 Q188 246 201 252 M245 252 Q259 246 272 250" fill="none" stroke="#a37d5b" stroke-width="2"/>
    <path d="M171 266 Q187 257 203 269 Q188 280 174 272 M244 268 Q258 257 274 265 Q263 279 246 274" fill="#fff8ed" stroke-width="1.6"/>
    <ellipse cx="189" cy="270" rx="6.3" ry="9.3" fill="#71856f" stroke="none"/><ellipse cx="259" cy="269" rx="6.3" ry="9.3" fill="#71856f" stroke="none"/>
    <path d="M170 266 Q187 256 203 268 M244 267 Q260 256 275 265" fill="none" stroke-width="2.7"/>
    <circle cx="187" cy="267" r="2.1" fill="#fff" stroke="none"/><circle cx="257" cy="266" r="2.1" fill="#fff" stroke="none"/>
    <ellipse cx="170" cy="292" rx="11" ry="4.8" fill="#e7aa95" stroke="none" opacity=".36"/><ellipse cx="274" cy="291" rx="11" ry="4.8" fill="#e7aa95" stroke="none" opacity=".36"/>
    <path d="M218 285 L214 295 L220 297 M210 314 Q222 320 234 313" fill="none" stroke="#b78573" stroke-width="1.5"/>
    <path d="M180 348 Q218 371 260 347 L271 366 Q226 396 172 370Z" fill="#fff0d5"/>
    <path d="M192 378 Q231 395 266 366 L272 390 Q254 408 220 408 L240 477 L210 488 L190 416 L172 395Z" fill="#f1ddba"/>
    <path d="M200 399 Q220 411 247 398 M216 465 L232 460 M214 473 L234 466" fill="none" stroke="#c4a37c" stroke-width="1.5"/>
    <path d="M282 368 L289 379 L173 491 L160 487Z" fill="#b28a61"/>
    <path d="M283 378 L169 485" fill="none" stroke="#e0c5a0" stroke-width="1.3"/>
    <circle cx="277" cy="377" r="11" fill="#e8c58a"/>
    <circle cx="277" cy="377" r="6" fill="#fff0d0" stroke-width="1.3"/>
    <path d="M276 372 L279 380 L274 379Z" fill="#a27b50" stroke="none"/>
  </g>`;
}

function moonGuardian() {
  return `<g stroke="#555575" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M267 75 Q332 101 307 166 Q341 145 327 108 Q315 75 267 75Z" fill="#fff6d8" stroke="none"/>
    <path d="M133 359 Q71 449 85 493 Q220 531 350 490 Q360 426 309 360Z" fill="url(#cloth)"/>
    <path d="M144 338 Q163 381 140 452 L172 494 L215 378 L252 494 L287 451 Q267 386 291 337Z" fill="#dce0f2"/>
    <path d="M119 205 Q91 324 102 405 Q81 442 103 456 Q137 421 140 370 Q132 423 156 434 Q175 389 177 363 L287 366 Q292 428 321 445 Q340 426 321 385 Q344 403 347 428 Q369 410 341 365 Q351 274 304 205Z" fill="url(#hair)"/>
    <path d="M205 318 L203 355 L180 363 Q218 412 258 364 L238 353 L239 318Z" fill="url(#skin)"/>
    <path d="M153 241 C159 174 277 157 294 239 L287 294 Q274 335 222 352 Q173 332 155 290Z" fill="url(#skin)"/>
    <path d="M135 265 Q127 199 159 163 Q220 106 284 159 Q325 190 308 271 L285 248 Q277 212 250 194 Q241 222 218 244 Q222 215 208 201 Q178 244 144 257Z" fill="url(#hair)"/>
    <path d="M153 177 Q190 151 232 151 M171 213 Q193 192 203 167 M271 207 Q256 175 239 166 M298 223 Q287 183 272 172" fill="none" stroke="#919dc7" stroke-width="1.8"/>
    <path d="M170 270 Q186 258 199 270 M244 269 Q259 257 273 268" fill="none" stroke-width="3.2"/>
    <ellipse cx="186" cy="276" rx="6.6" ry="10.5" fill="#6f6aa5" stroke="none"/><ellipse cx="257" cy="275" rx="6.6" ry="10.5" fill="#6f6aa5" stroke="none"/>
    <circle cx="184" cy="273" r="2.3" fill="#fff" stroke="none"/><circle cx="255" cy="272" r="2.3" fill="#fff" stroke="none"/>
    <path d="M217 291 L214 296 L220 298 M208 315 Q221 321 233 314" fill="none" stroke="#bb8178" stroke-width="1.5"/>
    <ellipse cx="170" cy="297" rx="13" ry="5.5" fill="#eaa6ac" opacity=".45" stroke="none"/><ellipse cx="273" cy="296" rx="13" ry="5.5" fill="#eaa6ac" opacity=".45" stroke="none"/>
    <path d="M145 259 L142 290 L136 303 L147 314 L157 302 L150 287Z" fill="#fff6d8"/><path d="M295 259 L298 290 L305 303 L294 314 L285 302 L291 287Z" fill="#fff6d8"/>
    <path d="M182 361 L218 386 L256 362 L224 370Z" fill="#faf1d7"/><path d="M218 371 L230 382 L219 400 L207 383Z" fill="#b1a2d0"/>
    <path d="M118 419 Q150 399 187 428 M262 426 Q286 402 323 419" fill="none" stroke="#adb4d8" stroke-width="1.5"/>
  </g>${star(101, 242, 9, '#fff7e2')}${star(339, 187, 7, '#fff7e2')}`;
}

function forestSpirit() {
  return `<g stroke="#45604b" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M68 441 Q220 471 382 432 Q352 481 69 475Z" fill="#496f55" opacity=".14" stroke="none"/>
    <path d="M115 328 Q53 292 77 250 Q97 273 116 292 Q83 204 120 175 Q135 215 146 244 Q145 166 185 151 Q190 194 180 228 Q239 170 261 194 Q222 236 191 252Z" fill="#507b59" stroke="#3d6547"/>
    <path d="M280 346 Q327 270 370 301 Q351 310 333 329 Q385 317 392 341 Q365 361 326 357Z" fill="#709567" stroke="#4d7654"/>
    <path d="M130 264 Q109 209 136 138 Q169 150 174 232 M246 232 Q254 149 286 136 Q316 203 293 274" fill="#89aa72"/>
    <path d="M139 220 Q133 181 143 161 Q159 184 158 220 M267 221 Q273 181 284 161 Q294 190 286 231" fill="#c5d7a6" stroke="none"/>
    <path d="M122 272 C112 222 169 210 215 216 C281 207 320 257 315 319 Q346 377 317 430 Q287 477 214 475 Q132 478 104 430 Q82 382 112 324Z" fill="url(#hair)"/>
    <path d="M132 333 Q202 290 280 333 Q315 397 268 433 Q212 467 146 430 Q105 388 132 333Z" fill="#eff2cf" stroke="none"/>
    <ellipse cx="153" cy="281" rx="18" ry="20" fill="#f9f8e5"/><ellipse cx="267" cy="281" rx="18" ry="20" fill="#f9f8e5"/>
    <ellipse cx="158" cy="283" rx="7" ry="9" fill="#344735" stroke="none"/><ellipse cx="262" cy="283" rx="7" ry="9" fill="#344735" stroke="none"/>
    <circle cx="155" cy="280" r="2" fill="#fff" stroke="none"/><circle cx="259" cy="280" r="2" fill="#fff" stroke="none"/>
    <path d="M197 296 Q209 284 222 296 Q211 308 197 296Z" fill="#50624a" stroke="none"/>
    <path d="M176 318 Q210 334 246 316" fill="none" stroke-width="2.5"/>
    <path d="M134 307 L100 299 M133 314 L95 315 M283 306 L320 298 M284 314 L326 315" fill="none" stroke-width="1.7"/>
    <path d="M124 327 Q99 348 108 377 Q114 389 130 380 M301 326 Q324 348 317 377 Q309 390 295 380" fill="#c0d69f"/>
    <path d="M166 225 Q203 185 249 211 Q227 244 166 225Z" fill="#5c8a56"/><path d="M174 223 L230 214 M209 218 L209 210" fill="none" stroke="#b3ce90" stroke-width="1.6"/>
    <path d="M138 446 Q121 438 104 443 Q87 452 106 462 Q123 471 145 463 M282 451 Q301 439 319 446 Q338 458 316 466 Q297 474 279 466" fill="#b8c99b"/>
  </g>`;
}

function crimsonFox() {
  return `<g stroke="#724346" stroke-width="2.3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M334 186 Q358 168 375 183 Q378 199 361 211 Q357 191 334 186Z M96 122 Q87 106 70 111 Q64 126 81 135 Q83 118 96 122Z" fill="#f8d7bd" stroke="none"/>
    <path d="M141 327 Q77 384 59 488 Q217 514 364 486 Q358 412 299 332Z" fill="url(#cloth)"/>
    <path d="M130 396 L74 480 L103 489 L152 423 M302 392 L347 480 L315 494 L278 429" fill="#c05d52"/>
    <path d="M144 232 Q92 324 123 370 Q137 396 166 383 Q172 419 192 421 L274 408 Q308 400 311 369 Q351 324 300 223Z" fill="#4f343c"/>
    <path d="M211 318 L206 344 L182 357 L219 405 L260 353 L238 338 L236 315Z" fill="url(#skin)"/>
    <path d="M151 226 C159 174 279 166 292 233 L285 295 Q270 333 224 344 Q179 331 157 293Z" fill="url(#skin)"/>
    <path d="M145 267 Q111 193 160 159 Q222 115 283 159 Q329 184 307 267 L283 251 Q277 213 250 194 Q237 225 199 236 Q219 204 201 192 Q183 235 145 267Z" fill="#4f343c"/>
    <path d="M144 212 Q135 176 164 160 M182 164 Q210 144 239 152 M267 163 Q295 181 301 216" fill="none" stroke="#a66361" stroke-width="3.2"/>
    <path d="M170 264 Q186 256 202 267 M245 266 Q261 255 274 264" fill="none" stroke-width="3"/>
    <ellipse cx="190" cy="274" rx="6.2" ry="10.3" fill="#a45b4e" stroke="none"/><ellipse cx="258" cy="273" rx="6.2" ry="10.3" fill="#a45b4e" stroke="none"/>
    <circle cx="188" cy="271" r="2.3" fill="#fff" stroke="none"/><circle cx="256" cy="270" r="2.3" fill="#fff" stroke="none"/>
    <path d="M219 289 L215 297 L222 299 M211 315 Q221 321 234 313" fill="none" stroke="#b47e72" stroke-width="1.4"/>
    <path d="M181 354 L219 399 L265 351 L276 371 L222 431 L168 375Z" fill="#ffe0ca"/><path d="M214 405 L244 446 L288 412 L279 399 L247 421 L229 401Z" fill="#be655b"/>
    <path d="M149 137 L119 153 L102 113 L95 193 Q97 225 130 239 L164 215 L182 183 L169 120Z" fill="#fff0d7"/>
    <path d="M106 117 L104 156 L119 151 M169 124 L174 159 L158 151" fill="#c56b5e" stroke="none"/>
    <path d="M111 182 L127 190 L140 182 M147 168 L159 174 L171 164" fill="none" stroke="#b85850" stroke-width="4.5"/>
    <path d="M131 212 L140 199 L151 202 L144 215Z" fill="#ba5b4f" stroke="none"/><path d="M111 196 L125 199 M153 185 L165 183" stroke="#d99b7f" stroke-width="1.8"/>
    <path d="M131 232 Q132 276 153 300" fill="none" stroke="#8c4d48"/><circle cx="154" cy="302" r="6" fill="#ecd1ad"/>
    <path d="M292 286 L304 310 L293 329" fill="none" stroke="#e3c39f" stroke-width="3"/>
    <path d="M119 449 L147 430 M299 458 L273 439" fill="none" stroke="#eeafa0" opacity=".6"/>
  </g>`;
}

function skyDragon() {
  return `<g stroke="#3e6a83" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 419 Q48 377 80 406 Q95 352 148 387 Q179 366 202 409 Q268 369 304 401 Q347 354 384 401 Q411 386 445 425 L445 463 L14 463Z" fill="#edf4f6" opacity=".75" stroke="none"/>
    <path d="M136 278 Q71 221 62 174 Q83 182 113 203 Q86 143 111 116 Q123 169 150 185 Q148 128 178 117 Q174 198 212 221Z" fill="#b8e2e9"/>
    <path d="M144 262 Q101 214 83 196 M149 247 Q122 181 122 151 M161 231 Q165 177 170 151" fill="none" stroke="#77b4cd" stroke-width="1.6"/>
    <path d="M262 256 Q318 184 374 171 Q363 215 334 236 Q371 223 390 241 Q357 271 305 281Z" fill="#b8e2e9"/>
    <path d="M273 264 Q321 231 356 197 M291 268 L366 245" fill="none" stroke="#77b4cd" stroke-width="1.6"/>
    <path d="M191 287 Q146 316 150 360 Q157 426 225 429 Q303 437 331 399 Q353 376 335 354 Q328 386 291 386 Q326 354 289 311Z" fill="#87c0d5"/>
    <path d="M169 352 Q193 312 226 325 Q274 345 291 385 Q266 414 213 411 Q166 400 169 352Z" fill="#d9ebeb" stroke="none"/>
    <path d="M185 377 Q221 366 271 385 M198 393 Q228 387 261 398" fill="none" stroke="#a3c6d2" stroke-width="1.6"/>
    <path d="M163 273 Q131 221 158 183 Q190 144 257 169 Q303 179 305 224 L316 257 Q307 292 266 301 Q216 326 163 273Z" fill="url(#hair)"/>
    <path d="M169 186 L159 155 L188 175 M260 175 L280 144 L285 188" fill="#fff2d5"/>
    <path d="M183 199 Q198 183 214 191 M250 193 Q267 181 283 197" fill="none" stroke="#86b1c3" stroke-width="4.5"/>
    <ellipse cx="201" cy="225" rx="13" ry="16" fill="#fff8e6"/><ellipse cx="271" cy="226" rx="12" ry="15" fill="#fff8e6"/>
    <ellipse cx="204" cy="227" rx="6" ry="10" fill="#427a93" stroke="none"/><ellipse cx="268" cy="228" rx="6" ry="10" fill="#427a93" stroke="none"/>
    <circle cx="202" cy="223" r="2.1" fill="#fff" stroke="none"/><circle cx="266" cy="224" r="2.1" fill="#fff" stroke="none"/>
    <ellipse cx="249" cy="252" rx="7" ry="4" fill="#82b2c6" stroke="none"/><path d="M219 270 Q246 285 272 267" fill="none" stroke-width="2"/>
    <path d="M174 255 Q143 257 137 240 M173 264 Q136 277 125 263 M294 256 Q327 264 330 248" fill="none" stroke="#dceef1" stroke-width="4"/>
    <path d="M185 313 Q142 316 136 346 Q157 360 178 345 M282 315 Q321 323 322 350 Q302 359 282 341" fill="#b9dfe8"/>
    <path d="M186 403 Q172 414 178 429 Q208 439 230 425 M268 405 Q288 419 278 433 Q253 440 237 426" fill="#b5dce4"/>
    <path d="M199 171 L218 144 L226 164 L242 146 L250 170" fill="#f3edd8"/>
  </g>${star(351, 325, 8, '#fff7e2')}`;
}

function starWitch() {
  return `<g stroke="#795372" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M314 148 L347 102 L358 167Z" fill="#fbe5bf" stroke-width="1.5"/>
    <path d="M114 342 Q81 407 84 490 Q221 517 352 484 Q346 408 297 340Z" fill="url(#cloth)"/>
    <path d="M119 228 Q76 298 101 373 Q112 399 136 383 Q125 427 148 432 Q170 399 177 368 L272 369 Q279 407 302 424 Q325 411 301 380 Q325 393 335 368 Q357 304 303 224Z" fill="#dcc1dc"/>
    <path d="M204 315 L203 351 L179 363 Q219 409 262 363 L239 347 L238 315Z" fill="url(#skin)"/>
    <path d="M146 233 C165 179 272 171 293 231 L286 289 Q273 332 220 345 Q170 329 152 287Z" fill="url(#skin)"/>
    <path d="M130 263 Q118 200 162 166 Q219 127 278 166 Q321 192 307 265 L283 252 Q272 211 246 197 Q232 226 206 243 Q220 212 204 197 Q180 236 140 260Z" fill="#dcc1dc"/>
    <path d="M154 183 Q181 160 211 158 M236 162 Q279 176 296 216 M162 223 Q188 201 196 177" fill="none" stroke="#aa7fa5" stroke-width="1.7"/>
    <path d="M166 263 Q183 251 202 265 M244 264 Q261 252 276 263" fill="none" stroke-width="3"/>
    <ellipse cx="187" cy="271" rx="6.2" ry="11" fill="#9c6a9e" stroke="none"/><ellipse cx="260" cy="270" rx="6.2" ry="11" fill="#9c6a9e" stroke="none"/>
    <circle cx="185" cy="268" r="2.3" fill="#fff" stroke="none"/><circle cx="258" cy="267" r="2.3" fill="#fff" stroke="none"/>
    <path d="M218 289 L214 297 L222 299 M209 315 Q221 323 233 314" fill="none" stroke="#b78483" stroke-width="1.5"/>
    <ellipse cx="166" cy="294" rx="11" ry="5" fill="#eeaaba" opacity=".5" stroke="none"/><ellipse cx="280" cy="293" rx="11" ry="5" fill="#eeaaba" opacity=".5" stroke="none"/>
    <path d="M114 196 Q137 153 160 136 Q170 89 188 60 Q230 104 277 127 L291 153 Q340 171 328 193 Q270 212 219 205 Q160 210 114 196Z" fill="url(#cloth)"/>
    <path d="M148 160 Q223 183 293 159 L284 146 Q214 165 157 146Z" fill="#e2b5bc"/>
    <path d="M190 149 L196 159 L207 160 L198 168 L200 179 L190 173 L180 179 L182 168 L173 160 L184 159Z" fill="#f3dbad"/>
    <path d="M181 362 L218 391 L259 360 L261 386 L221 422 L178 386Z" fill="#f5dce8"/>
    <path d="M189 381 L214 393 L220 425 L228 392 L249 381 L252 399 L229 414 L220 440 L209 414 L185 399Z" fill="#c797bd"/>
    <path d="M311 266 L316 475" fill="none" stroke="#b18d6d" stroke-width="7"/>
    <path d="M311 223 L317 240 L335 240 L321 251 L326 268 L312 258 L297 268 L303 251 L289 240 L306 240Z" fill="#fae5b2"/>
    <path d="M287 351 Q297 336 313 344 Q327 353 311 365 L292 367Z" fill="url(#skin)"/>
    <path d="M117 430 Q147 408 177 427 M257 455 Q274 433 293 444" fill="none" stroke="#d7b6d4" stroke-width="1.5"/>
  </g>${star(359, 246, 8, '#fff4d5')}${star(80, 291, 7, '#fff4d5')}`;
}

const subjects = { 'electric-sun': solarTraveler, 'moon-guardian': moonGuardian, 'forest-spirit': forestSpirit, 'crimson-fox': crimsonFox, 'sky-dragon': skyDragon, 'star-witch': starWitch };

export function renderCardArt(id) {
  if (!ART_IDS.includes(id)) throw new Error(`Unknown art: ${id}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="560" viewBox="0 0 440 560" role="img" aria-label="Лумоли — сказочная иллюстрация мира ${palettes[id][4]}">${commonBackground(id, palettes[id])}${subjects[id]()}<rect width="440" height="560" fill="url(#grain)" pointer-events="none"/><rect x="8" y="8" width="424" height="544" rx="8" fill="none" stroke="${palettes[id][2]}" opacity=".5"/></svg>`;
}
