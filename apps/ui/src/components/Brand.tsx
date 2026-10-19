/** Vector wordmark; presentation only.
 *  印章先求「认得出」，再求「像印」：竖长印面、红底白字（殷文）、字顶到边、
 *  四角有崩口、印泥压印不匀、整体微倾。
 *
 *  为什么不用篆书：印面实际只有 33px 宽，篆书的笔画密度在这个尺寸下会糊成色块，
 *  两个字会完全认不出来。所以字形回到宋体，把「印感」交给形制与质感去承担。
 *  - cjSealCut    : mask，红泥保留区（压力渐变 + 崩口 + 字挖空）
 *  - cjSealRough  : 位移滤镜，做刀口毛边
 *  - cjSealGrain  : 红面上打散纸色斑点，模拟印泥没吃透的飞白 */
export default function Brand(){
 return <div className="brand" aria-label="鉴实 · 网站验证工作台">
  <svg className="brand-wordmark" viewBox="0 0 250 84" role="img" aria-label="鉴实">
   <defs>
    <linearGradient id="cjSealPress" x1="0" y1="0" x2=".7" y2="1">
     <stop offset="0" stopColor="#fff" stopOpacity="1"/>
     <stop offset=".62" stopColor="#fff" stopOpacity=".97"/>
     <stop offset="1" stopColor="#fff" stopOpacity=".9"/>
    </linearGradient>

    <filter id="cjSealRough" x="-22%" y="-22%" width="144%" height="144%">
     <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="3" seed="23" result="rough"/>
     <feDisplacementMap in="SourceGraphic" in2="rough" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
    </filter>

    <filter id="cjSealGrain" x="-12%" y="-12%" width="124%" height="124%">
     <feTurbulence type="fractalNoise" baseFrequency="1.9" numOctaves="2" seed="5" result="n"/>
     <feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -5.5 3.55" result="dots"/>
     <feComposite in="SourceGraphic" in2="dots" operator="in"/>
    </filter>

    <mask id="cjSealCut" mask-type="luminance">
     <rect x="200" y="8" width="32" height="42" fill="url(#cjSealPress)"/>
     {/* 手工崩口：石章磕碰留下的缺口 */}
     <path d="M200 8 L203.6 8 L200 11.8 Z" fill="#000"/>
     <path d="M228.4 8 L232 8 L232 10.8 Z" fill="#000"/>
     <path d="M200 46.4 L200 50 L203.2 50 Z" fill="#000"/>
     <path d="M229.4 48.4 L232 46.8 L231.6 50 L227.4 50 Z" fill="#000"/>
     <path d="M200 27 L200 29.4 L202 28.6 Z" fill="#000"/>
     <path d="M232 21.4 L232 23.8 L230.2 22.6 Z" fill="#000"/>
     <path d="M213 8 L215.4 8 L214 9.9 Z" fill="#000"/>
     <text x="216" y="28" className="brand-seal-face">鉴</text>
     <text x="216" y="47" className="brand-seal-face">实</text>
    </mask>
   </defs>

   <text x="5" y="52" className="brand-script">鉴实</text>
   <path className="brand-flourish" d="M10 62C47 53 81 59 115 61S170 69 193 59"/>

   <g transform="rotate(-2.6 216 29)">
    <rect x="200" y="8" width="32" height="42" className="brand-seal-ground" mask="url(#cjSealCut)" filter="url(#cjSealRough)"/>
    <rect x="200" y="8" width="32" height="42" className="brand-seal-grain" filter="url(#cjSealGrain)"/>
   </g>

   <text x="11" y="79" className="brand-caption">WEBSITE VERIFICATION</text>
  </svg>
 </div>;
}
