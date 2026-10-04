const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const base = process.env.BOARD_TILE_TEST_URL || 'http://localhost:4352';
const evidence = path.join(__dirname, 'output/tile-preview');
async function board(page) {
  await page.goto(base + '/play?fixture=1&guide=done');
  await page.waitForFunction(() => state?.catalog && PW._debugScene()?.children.list.some(x => /^pwTile/.test(x.texture?.key || '')));
  await page.waitForFunction(() => PW.cameraState().isFit);
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [width, height] of [[1440,900], [1280,720]]) {
      const page = await browser.newPage({ viewport: {width,height} }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await board(page);
      assert.equal(await page.evaluate(() => BoardTiles.loaded), true);
      assert.equal(await page.locator('#tileToolbar,#tileComparison').count(), 0, 'Production must not contain comparison controls');
      const result = await page.evaluate(async () => {
        const geometry = {DW,DH,THICK,TW,TH,ELEM};
        const colors = {fire:'#ff7a45',water:'#65b9f2',earth:'#e1c45e',wind:'#59e6c5',neutral:'#c9b9ef'};
        const snapshots = [];
        for (const [element,color] of Object.entries(colors)) for (const level of [1,2,3,4]) {
          const svg = buildTileSVG(99, {t:'land',e:element}, {level}, '#ab2244', true, 24, '');
          const doc = new DOMParser().parseFromString(svg,'image/svg+xml');
          const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await image.decode();
          const canvas = document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
          snapshots.push({element,level,band:doc.querySelector('[data-tile-color="band"] path[filter]').getAttribute('stroke'),
            logo:doc.querySelector('[data-tile-logo]').getAttribute('data-tile-logo'),
            alpha:ctx.getImageData(0,0,1,1).data[3],drawn:ctx.getImageData(80,80,1,1).data[3]});
        }
        const events=['castle','gate','market','shrine'].map(t=> {
          const svg=buildTileSVG(99,{t},null,null,null,24,'');
          return {t,plain:!svg.includes('data-tile-color')&&!svg.includes('data-tile-logo'),height:new DOMParser().parseFromString(svg,'image/svg+xml').documentElement.getAttribute('height')};
        });
        const geometryCheck=[3,4].map(level=>BoardTiles.ground(level,geometry));
        const scene=PW._debugScene();
        const tiles=scene.children.list.filter(x=>/^pwTile/.test(x.texture?.key||''));
        const art=scene.children.list.filter(x=>/^pwCre_|^pwImg_/.test(x.texture?.key||''));
        renderBoardDom();
        return {snapshots,events,geometryCheck,expectedPitch:Math.atan(TH/TW)*180/Math.PI,
          tileCount:tiles.length,expectedCount:state.tiles.length,artDepth:art.every(x=>x.depth>Math.max(...tiles.map(x=>x.depth))),
          domBands:document.querySelectorAll('#stage [data-tile-color="band"]').length,
          landCount:state.tiles.filter(t=>t.t==='land').length};
      });
      const expectedColors={fire:'#ff7a45',water:'#65b9f2',earth:'#e1c45e',wind:'#59e6c5',neutral:'#c9b9ef'};
      for(const s of result.snapshots){assert.equal(s.band,expectedColors[s.element]);assert.equal(s.logo,s.element);assert.equal(s.alpha,0);assert(s.drawn>200);}
      assert(result.events.every(e=>e.plain&&e.height==='120'),'Event buildings must use the plain Lv1 platform');
      assert(result.geometryCheck.every(g=>g.angles.every(a=>Math.abs(a-result.expectedPitch)<.001)),'Both Lv3/4 ground edges must match board axes');
      assert.equal(result.tileCount,result.expectedCount);assert(result.artDepth,'Tile light must stay underneath creatures and players');
      assert.equal(result.domBands,result.landCount,'DOM and Phaser must share the approved renderer');
      await page.screenshot({path:path.join(evidence,`integrated-${width}.png`)});
      const previous=await page.evaluate(()=>PW._debugScene().children.list.find(x=>/^pwTile/.test(x.texture?.key||''))?.texture.key);
      await page.evaluate(()=>{const i=state.owners.findIndex(Boolean);state.owners[i].level=4;state.tiles[i].e='neutral';renderBoard();});
      await page.waitForFunction(old=>!PW._debugScene().children.list.some(x=>x.texture?.key===old)&&PW._debugScene().children.list.some(x=>/^pwTile/.test(x.texture?.key||'')),previous);
      assert.deepEqual(errors,[]);await page.close();console.log('PASS live board, all levels/elements, events, geometry, alpha and sprite layers:',width);
    }
    for(const failure of ['asset','script','slow']){
      const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      if(failure==='script')await page.route('**/assets/board-tiles.js*',r=>r.abort());
      else await page.route('**/assets/tiles/land-lv4.png',async r=>{if(failure==='slow'){await new Promise(resolve=>setTimeout(resolve,4500));await r.continue();}else await r.abort();});
      await board(page);
      assert.equal(await page.evaluate(()=>!!window.BoardTiles?.loaded),failure==='slow');
      assert.equal(await page.locator('#renderError').isVisible(),false);
      assert.deepEqual(errors,[]);await page.close();console.log('PASS board remains usable:',failure);
    }
    for(const level of [1,2,3,4]){
      const original=fs.readFileSync(path.join(evidence,'raster',level===4?'level-4-v2.png':`level-${level}.png`));
      assert(original.equals(fs.readFileSync(path.join(__dirname,`public/assets/tiles/land-lv${level}.png`))),'Approved original PNG must be preserved');
    }
    console.log('PASS original artwork unchanged');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
