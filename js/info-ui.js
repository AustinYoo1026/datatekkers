/* ISO FOOTBALL — the Info page (main menu). Everything is read from the data tables (ISO.TRAITS, ISO.ROLES, ISO.CELEBS, ISO.GK_STYLES, ISO.AI.ARCH, ISO.Game.SKILLS,
   ISO.CUPS, ISO.SEASONS, ISO.DRILLS ...) at render time, so it cannot drift from the game. UI only: no simulation state is read or written. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let tab = 'traits';
  const ROLE_DESC = { winger: 'Hugs the touchline: quicker on the flank and sharper cuts and turns.', striker: 'Poacher: sprints straight at goal and gets the first touch away fast.',
    playmaker: 'Tight, creative dribbling: the ball turns and pulls back sweetly.', target: 'Big and strong: slower to turn, but wins the ball in the air and holds it.',
    box2box: 'An engine: sprints at pace and stops and turns well.', defender: 'Stopper: stops on a sixpence and wins the ball back.' };
  const TABS = [['traits', 'SKILL TRAITS'], ['roles', 'PLAYSTYLES'], ['moves', 'SKILL MOVES'], ['celebs', 'CELEBRATIONS'], ['gk', 'KEEPER STYLES'], ['ai', 'CPU PERSONALITIES'], ['rules', 'RULES & MODES']];
  const card = (title, sub, body, extra) => '<div class="info-card"><div class="ic-h"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div><p>' + esc(body) + '</p>' + (extra || '') + '</div>';
  const grid = (cards) => '<div class="info-grid">' + cards.join('') + '</div>';
  const SECTIONS = {
    traits: () => '<p class="note">A player earns up to two or three traits from the attributes behind them (the best qualifying ones are active). Shown on player cards and in the store.</p>' +
      grid(ISO.TRAIT_ORDER.map((id) => { const T = ISO.TRAITS[id]; return card(T.name, T.tag, T.desc); })),
    roles: () => '<p class="note">Every player has one playstyle, picked by hand for the stars and derived from attributes for the rest. It nudges movement and touch.</p>' +
      grid(Object.keys(ISO.ROLES).map((id) => card(ISO.ROLES[id].name, '', ROLE_DESC[id] || 'Adjusts movement and touch.'))),
    moves: () => { const SK = ISO.Game.SKILLS; return '<p class="note">Every skill move is unlocked. A move needs enough skill stars; until then the input does a simpler move.</p>' +
      grid(Object.keys(SK).map((id) => card(SK[id].name || id, SK[id].star ? '★'.repeat(SK[id].star) + ' skill stars' : '', 'Skill move' + (SK[id].star ? ' needing ' + SK[id].star + ' star' + (SK[id].star > 1 ? 's' : '') + '.' : '.')))); },
    celebs: () => '<p class="note">After a goal your player celebrates (2D and 3D, online too). Celebrations are cosmetic.</p>' +
      grid([card(ISO.CELEB_SIG.name, 'FREE', ISO.CELEB_SIG.desc)].concat(ISO.CELEBS.map((c) => card(c.name, c.cost ? c.cost + ' CR' : 'FREE', c.desc)))),
    gk: () => '<p class="note">Each CPU keeper has a style, shown on the match-settings page.</p>' + grid(ISO.GK_ORDER.map((id) => card(ISO.GK_STYLES[id].name, '', ISO.GK_STYLES[id].desc))),
    ai: () => '<p class="note">How the CPU plays. Shown on the opponent panel as the AI chip.</p>' + grid(ISO.AI.ARCH_ORDER.map((id) => card(ISO.AI.ARCH[id].name, '', ISO.AI.ARCH[id].desc))),
    rules: () => {
      const rule = (t, d) => card(t, '', d);
      const modes = [rule('Standard rules', 'First to three goals wins. Win the rebound, keep the ball, shoot.'), rule('Street Football', 'Walled cage, first to five or three minutes. Goals from range or off the wall count double; quicker feet and cheaper skills.'),
        rule('Quick Match', 'Pick your footballer and an opponent, then set difficulty, weather, pitch and rules on the next page.'), rule('MyCareer', 'Build your own player through ' + ISO.SEASONS.length + ' seasons of league football. Wins earn upgrade points.'),
        rule('Online 1v1', 'Play a friend over the internet with a room code, or join quick match.'), rule('Weather', 'Rain makes the ball skip and players slip. Turn it on before kickoff.'),
        rule('Pitch surfaces', (ISO.Game.turfs || []).join(', ') + ': each changes how the ball bounces and runs.')];
      const seasons = ISO.SEASONS.map((s) => card(s.name, s.tag, 'Win the table to move up; finish low and you can be relegated. Prize ' + s.prize + ' CR.'));
      const cups = ISO.CUPS.map((c) => card(c.name, c.tag, c.desc));
      const drills = Object.keys(ISO.DRILLS).filter((k) => k !== 'custom').map((k) => card(ISO.DRILLS[k].name, 'max ' + ISO.DRILLS[k].max, ISO.DRILLS[k].tip || 'A drill against the keeper that pays credits for your score.'));
      return '<h3 class="info-h">MODES &amp; RULES</h3>' + grid(modes) + '<h3 class="info-h">CAREER SEASONS</h3>' + grid(seasons) + '<h3 class="info-h">TOURNAMENTS</h3>' + grid(cups) + '<h3 class="info-h">DRILLS</h3>' + grid(drills);
    },
  };
  function render() {
    $('infoTabs').innerHTML = TABS.map(([id, n]) => '<button class="segb' + (id === tab ? ' on' : '') + '" data-info-tab="' + id + '">' + n + '</button>').join('');
    let html; try { html = SECTIONS[tab](); } catch (e) { html = '<p class="note">Nothing to show here yet.</p>'; }
    $('infoBody').innerHTML = html; $('infoBody').scrollTop = 0;
  }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-info-tab]'); if (t) { tab = t.dataset.infoTab; render(); } });
  ISO.InfoUI = { render };
})();
