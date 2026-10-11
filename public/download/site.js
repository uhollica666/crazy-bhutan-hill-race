// Launch site behaviour. No framework, no trackers, no cookies. Facts come from files that ship with the game:
//   release.json    confirmed published release metadata (the only source of download links)
//   game-data.json  vehicles and routes, generated from the game's own data (bun scripts/site-data.ts)
//   ../support.json voluntary-support channels (inactive until the developer verifies them)
import { activeChannels, pendingChannels } from './support-core.js';

document.documentElement.classList.add('js');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const json = (url) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url))));

/* ------------------------------------------------------------------ nav, parallax, reveal */
const nav = $('.nav');
const hero = $('.hero-bg');
const links = $$('.nav-links a');
const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY;
    nav.classList.toggle('solid', y > 40);
    if (!reduce && y < innerHeight * 1.2) hero.style.transform = `translate3d(0, ${y * 0.22}px, 0) scale(${1 + y * 0.00012})`;
    const probe = y + innerHeight * 0.35;
    let current = null;
    for (const s of sections) if (s.offsetTop <= probe) current = s.id;
    links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${current}`));
    ticking = false;
  });
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
);
function watch(root = document) {
  $$('.eyebrow, .section h2, .section-lede, .prose, .answers, .plat, .card, .panel, .team, .tile, .support-box, .tracks, .veh-stage, details', root).forEach((el, i) => {
    if (el.classList.contains('reveal')) return;
    el.classList.add('reveal');
    el.style.setProperty('--d', `${(i % 4) * 0.07}s`);
    io.observe(el);
  });
}
watch();

/* ------------------------------------------------------------------ prayer-flag bunting */
{
  const svg = $('.bunting');
  const path = $('.bunting-line', svg);
  const g = $('.flags', svg);
  const colors = ['#2f6fd0', '#f6f4ee', '#d6322b', '#2e9c4f', '#f0c23a'];
  const len = path.getTotalLength();
  const n = 34;
  for (let i = 0; i < n; i++) {
    const p = path.getPointAtLength((len * (i + 0.5)) / n);
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    f.setAttribute('d', `M${p.x - 15} ${p.y} h30 v34 l-15 -9 l-15 9 z`);
    f.setAttribute('fill', colors[i % 5]);
    f.setAttribute('opacity', '0.95');
    f.style.animationDelay = `${-(i * 0.37) % 4.5}s`;
    g.append(f);
  }
}

/* ------------------------------------------------------------------ gauge */
{
  const ticks = $('.g-ticks');
  for (let i = 0; i <= 12; i++) {
    const a = ((-125 + (250 * i) / 12) * Math.PI) / 180;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const r1 = i % 3 === 0 ? 64 : 70;
    l.setAttribute('x1', 100 + Math.sin(a) * r1);
    l.setAttribute('y1', 100 - Math.cos(a) * r1);
    l.setAttribute('x2', 100 + Math.sin(a) * 78);
    l.setAttribute('y2', 100 - Math.cos(a) * 78);
    if (i > 9) l.setAttribute('class', 'hot');
    ticks.append(l);
  }
  const needle = $('.g-needle');
  const read = $('.g-read');
  const to = (kmh) => {
    needle.style.transform = `rotate(${-125 + (250 * kmh) / 160}deg)`;
  };
  let shown = 0;
  const target = 112;
  if (reduce) {
    to(target);
    read.textContent = target;
  } else {
    requestAnimationFrame(() => to(target));
    const t0 = performance.now();
    (function count(t) {
      const k = Math.min(1, (t - t0) / 1600);
      shown = Math.round(target * (1 - Math.pow(1 - k, 3)));
      read.textContent = shown;
      if (k < 1) requestAnimationFrame(count);
    })(t0);
    // The needle breathes with the scroll position, like a car on the road.
    addEventListener(
      'scroll',
      () => {
        const k = Math.min(1, scrollY / (document.body.scrollHeight - innerHeight));
        const kmh = 70 + 60 * Math.sin(k * 14) ** 2;
        to(kmh);
        read.textContent = Math.round(kmh);
      },
      { passive: true },
    );
  }
}

/* ------------------------------------------------------------------ routes + vehicles (from the game's own data) */
const COND = { 'clear/day': 'Clear', 'fog/day': 'Fog', 'rain/day': 'Rain', 'heavyRain/day': 'Storm', 'snow/day': 'Snow', 'cloudy/day': 'Cloud', 'clear/dusk': 'Dusk', 'fog/dusk': 'Dusk fog', 'clear/night': 'Night', 'fog/night': 'Night fog', 'rain/night': 'Night rain', 'rain/dusk': 'Dusk rain', 'heavyRain/dusk': 'Dusk storm', 'blizzard/day': 'Blizzard', 'denseFog/day': 'Dense fog', 'denseFog/night': 'Night fog' };
const flagDots = ['#2f6fd0', '#f6f4ee', '#d6322b', '#2e9c4f', '#f0c23a'];

function routeCard(r) {
  const li = document.createElement('li');
  li.className = 'route';
  const conds = r.conditions.slice(0, 3).map((c) => `<span class="chip">${esc(COND[c] || c.replace('/', ' '))}</span>`).join('');
  const diff = '◆'.repeat(r.difficulty) + `<span class="off">${'◆'.repeat(5 - r.difficulty)}</span>`;
  const flags = flagDots.map((c, i) => `<i style="background:${c};height:${10 + ((r.n + i) % 3) * 3}px"></i>`).join('');
  li.innerHTML = `
    <div class="route-img"><img src="media/route-${esc(r.id)}.webp" alt="${esc(r.name)}: a screenshot from the game" width="840" height="525" loading="lazy" decoding="async" /></div>
    <span class="route-n">${String(r.n).padStart(2, '0')}</span>
    <span class="route-flag" aria-hidden="true">${flags}</span>
    <div class="route-body">
      <h3>${esc(r.name)}</h3>
      <div class="sub">${esc(r.subtitle)}</div>
      <p>${esc(r.summary)}</p>
      <div class="chips">${conds}<span class="diff" title="Difficulty ${r.difficulty} of 5">${diff}</span></div>
    </div>`;
  li.querySelector('img').addEventListener('error', (e) => e.target.closest('.route-img').remove());
  return li;
}

function vehicleUI(vehicles) {
  const tabs = $('#veh-tabs');
  const detail = $('#veh-detail');
  const img = $('#veh-img');
  const max = { topSpeedKmh: 160, seats: 10, rangeKm: 8, offroad: 1 };
  const show = (v, focus) => {
    $$('button', tabs).forEach((b) => {
      const on = b.dataset.id === v.id;
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    const stat = (label, val, text, k) => `<div class="stat"><span>${label}</span><div class="bar"><i style="--v:${Math.round(Math.min(1, k) * 100)}%"></i></div><b>${text}</b></div>`;
    detail.innerHTML = `<p>${esc(v.blurb)}</p>
      ${stat('Top speed', v.topSpeedKmh, `${v.topSpeedKmh}`, v.topSpeedKmh / max.topSpeedKmh)}
      ${stat('Seats', v.seats, `${v.seats}`, v.seats / max.seats)}
      ${stat('Fuel range', v.rangeKm, `${v.rangeKm}km`, v.rangeKm / max.rangeKm)}
      ${stat('Off-road', v.offroad, v.fourByFour ? '4x4' : '4x2', v.offroad)}`;
    img.classList.add('swap');
    setTimeout(() => {
      img.src = `media/veh-${v.id}.webp`;
      img.alt = `${v.name} in the garage`;
      img.onload = () => img.classList.remove('swap');
      setTimeout(() => img.classList.remove('swap'), 400);
    }, reduce ? 0 : 220);
  };
  tabs.innerHTML = vehicles.map((v) => `<button role="tab" data-id="${esc(v.id)}" aria-selected="false">${esc(v.name)}</button>`).join('');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) show(vehicles.find((v) => v.id === b.dataset.id));
  });
  tabs.addEventListener('keydown', (e) => {
    const i = vehicles.findIndex((v) => $('[aria-selected=true]', tabs)?.dataset.id === v.id);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      e.preventDefault();
      show(vehicles[(i + step + vehicles.length) % vehicles.length], true);
    }
  });
  show(vehicles[0]);
}

json('game-data.json')
  .then((data) => {
    const rail = $('#rail');
    data.routes.forEach((r) => rail.append(routeCard(r)));
    vehicleUI(data.vehicles);
    watch(rail);
  })
  .catch(() => {
    $('#rail').innerHTML = '<li class="route"><div class="route-body"><h3>Ten routes</h3><p>The route list could not be loaded. Open the game to see every level.</p></div></li>';
  });

$$('.rail-btn').forEach((b) =>
  b.addEventListener('click', () => {
    const rail = $('#rail');
    rail.scrollBy({ left: Number(b.dataset.rail) * Math.min(rail.clientWidth * 0.8, 460), behavior: reduce ? 'auto' : 'smooth' });
  }),
);

/* ------------------------------------------------------------------ weather & wildlife bento (real screenshots) */
const BENTO = [
  { src: 'wild-snow', cls: 'big', cap: 'Snow and ice', small: 'Chele La. Four-wheel drive helps.' },
  { src: 'wild-night', cls: 'tall', cap: 'Night driving', small: 'Thimphu after dark.' },
  { src: 'wild-storm', cls: '', cap: 'Heavy rain', small: 'Dochula. Roads get slippery.' },
  { src: 'wild-fog', cls: '', cap: 'Fog', small: 'Visibility drops on the mountain roads.' },
  { src: 'wild-creatures', cls: 'big', cap: 'Animals on the road', small: 'Yaks and other wildlife, plus a few fictional creatures.' },
  { src: 'wild-ford', cls: '', cap: 'River crossings', small: 'Some vehicles wade deeper than others.' },
];
{
  const b = $('#bento');
  b.innerHTML = BENTO.map(
    (t) => `<figure class="tile ${t.cls}"><img src="media/${t.src}.webp" alt="${esc(t.cap)}: a screenshot from the game" loading="lazy" decoding="async" /><figcaption>${esc(t.cap)}<small>${esc(t.small)}</small></figcaption></figure>`,
  ).join('');
  $$('img', b).forEach((img) => img.addEventListener('error', () => img.closest('.tile').remove()));
  watch(b);
}
$$('.tracks li').forEach((li, i) => li.querySelector('i').style.setProperty('--i', i));

/* ------------------------------------------------------------------ downloads (confirmed release metadata only) */
const mb = (bytes) => `${(bytes / 1048576).toFixed(0)} MB`;
const isGithub = (u) => typeof u === 'string' && u.startsWith('https://github.com/uhollica666/crazy-bhutan-hill-race/releases/');

function artifactBlock(a) {
  const wrap = document.createElement('div');
  wrap.className = 'dl-item';
  const link = document.createElement('a');
  link.className = 'btn btn-fire';
  link.href = a.url;
  link.rel = 'noopener';
  link.innerHTML = `${esc(a.label)}<span>${mb(a.bytes)}</span>`;
  wrap.append(link);
  if (a.sha256 && /^[a-f0-9]{64}$/.test(a.sha256)) {
    const sha = document.createElement('div');
    sha.className = 'sha';
    sha.innerHTML = `<span>SHA-256</span><code title="${a.sha256}">${a.sha256}</code>`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(a.sha256);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Select';
      }
      setTimeout(() => (copy.textContent = 'Copy'), 1800);
    });
    sha.append(copy);
    wrap.append(sha);
  }
  return wrap;
}

json('release.json')
  .then((rel) => {
    $('#release-line').innerHTML = `Version <b>${esc(rel.version)}</b>${rel.date ? ` · ${esc(rel.date)}` : ''} · ${esc(rel.channel || 'public beta')}. The downloads below link to the published release files on GitHub. This is a beta, so some things may not work as they should.`;
    for (const platform of ['windows', 'android']) {
      const card = $(`#plat-${platform}`);
      const arts = (rel.artifacts || []).filter((a) => a.platform === platform && isGithub(a.url));
      const note = $('[data-note]', card);
      const box = $('[data-links]', card);
      if (!arts.length) {
        note.textContent = 'Not published in this release yet. Play online in the meantime.';
        box.innerHTML = '<div class="unavailable">No download available</div>';
        continue;
      }
      note.textContent = platform === 'android' ? 'A signed APK for direct installation.' : 'Choose the EXE installer or the MSI package.';
      arts.forEach((a) => box.append(artifactBlock(a)));
    }
    $('#cl-version').textContent = rel.version;
    $('#changelog').innerHTML = (rel.notes || []).map((n) => `<li>${esc(n)}</li>`).join('');
    if (isGithub(rel.releaseUrl) || (rel.releaseUrl || '').startsWith('https://github.com/uhollica666/')) {
      const a = $('#release-link');
      a.href = rel.releaseUrl;
      a.hidden = false;
    }
  })
  .catch(() => {
    $('#release-line').textContent = 'The release list could not be loaded. You can always play online, or open the GitHub releases page.';
    for (const p of ['windows', 'android']) $(`#plat-${p} [data-note]`).textContent = 'Downloads are unavailable right now.';
    const a = $('#release-link');
    a.hidden = false;
  });

/* controls tabs */
{
  const tabs = $$('#ctl-tabs [role=tab]');
  const select = (t) => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', on);
      x.tabIndex = on ? 0 : -1;
      $(`#${x.getAttribute('aria-controls')}`).hidden = !on;
    });
  };
  tabs.forEach((t) => t.addEventListener('click', () => select(t)));
  $('#ctl-tabs').addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      const t = tabs[(i + step + tabs.length) % tabs.length];
      select(t);
      t.focus();
    }
  });
}

/* ------------------------------------------------------------------ team interest (no backend, no personal data required) */
{
  const form = $('#team-form');
  const msg = $('#team-msg');
  const emailBtn = $('#team-email');
  let teamEmail = null;
  json('../community.json')
    .then((c) => {
      if (typeof c.teamEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.teamEmail)) {
        teamEmail = c.teamEmail;
        emailBtn.hidden = false;
      }
    })
    .catch(() => {});
  const scrub = (s) => String(s).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email removed]').slice(0, 400);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const route = e.submitter?.dataset.route || 'github';
    const roles = $$('input[name=role]:checked', form).map((i) => i.value);
    if (!roles.length) {
      msg.textContent = 'Choose at least one role you could help with.';
      return;
    }
    const link = form.elements.link.value.trim();
    if (link && !/^https:\/\/[^\s]+$/.test(link)) {
      msg.textContent = 'Please use an https:// link, or leave it empty.';
      return;
    }
    const note = scrub(form.elements.note.value);
    const body = `Roles: ${roles.join(', ')}\nWork: ${link || '(none)'}\nNote: ${note || '(none)'}\n`;
    const title = `Team interest: ${roles.join(', ')}`;
    let url;
    if (route === 'email' && teamEmail) url = `mailto:${teamEmail}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    else url = `https://github.com/uhollica666/crazy-bhutan-hill-race/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    msg.textContent = route === 'email' ? 'Opening your email app...' : 'Opening GitHub. Nothing is posted until you press Submit there. Remember: GitHub notes are public.';
    window.open(url, '_blank', 'noopener');
  });
}

/* ------------------------------------------------------------------ voluntary support (inactive until verified) */
json('../support.json')
  .then((cfg) => {
    const box = $('#support-box');
    const active = activeChannels(cfg);
    const pending = pendingChannels(cfg);
    const card = (c, isActive) => {
      const where = c.region ? `<span class="tag">${esc(c.region)}</span>` : '';
      const how = [c.recurring ? 'monthly' : '', c.oneTime ? 'one-time' : ''].filter(Boolean).join(' or ');
      if (!isActive) return `<div class="opt pending">${where}<b>${esc(c.title)}</b><small>Being set up. Not available yet${how ? ` (${how})` : ''}.</small></div>`;
      if (c.type === 'qr') return `<div class="opt qr">${where}<b>${esc(c.title)}</b><img src="${esc(c.qrImage)}" alt="${esc(c.title)} code" width="180" height="180" /><small>${esc(c.description || 'Scan with your banking app.')}</small></div>`;
      return `<div class="opt">${where}<b>${esc(c.title)}</b><small>${esc(c.description || 'You will leave this site and pay on the provider’s own page.')}${how ? ` Available as ${how}.` : ''}</small><a class="btn btn-fire" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Support on ${esc(c.title)}</a></div>`;
    };
    box.innerHTML = `<h3>${active.length ? 'Ways to say thank you' : 'Support is being set up'}</h3>
      ${active.length ? '' : '<p class="fine">We&rsquo;re still checking our payment options, so there&rsquo;s nothing to pay or scan yet. The game stays free either way.</p>'}
      ${active.map((c) => card(c, true)).join('')}${pending.map((c) => card(c, false)).join('')}`;
  })
  .catch(() => {
    $('#support-box').innerHTML = '<h3>Support is being set up</h3><p class="fine">Nothing on this site asks for payment today.</p>';
  });

/* ------------------------------------------------------------------ share + footer links that open a details block */
{
  const btn = $('#share-btn');
  const msg = $('#share-msg');
  const data = { title: 'Crazy Bhutan Hill Race', text: 'A free driving game inspired by Bhutan, now in public beta.', url: 'https://crazy-bhutan-hill-race.vercel.app/' };
  btn.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(data.url);
      msg.textContent = 'Link copied.';
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      msg.textContent = `Link: ${data.url}`;
    }
    setTimeout(() => (msg.textContent = ''), 4000);
  });
  const openTarget = () => {
    const t = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (t && t.tagName === 'DETAILS') t.open = true;
  };
  addEventListener('hashchange', openTarget);
  openTarget();
}
