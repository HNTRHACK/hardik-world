import type { Project } from '../content/projects';
import { PROFILE, WINS } from '../content/profile';
import { ARROW_ICON, CLOSE_ICON } from '../stalls/icons';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Anything the panel can show. */
export interface PanelEntry {
  id: string;
  short: string;
  title: string;
  html(): string;
}

const head = (kicker: string, short: string) => `
  <header class="panel__head">
    <p class="panel__kicker">${kicker}</p>
    <button class="panel__close" type="button" data-close aria-label="Close ${esc(short)}">${CLOSE_ICON}</button>
  </header>`;

const btn = (href: string, label: string, primary = false, newTab = true) =>
  `<a class="panel__btn${primary ? ' panel__btn--primary' : ''}" href="${esc(href)}"${newTab ? ' target="_blank" rel="noopener"' : ''}>${esc(label)}${ARROW_ICON}${
    newTab ? '<span class="visually-hidden"> (opens in a new tab)</span>' : ''
  }</a>`;

const hint = `<p class="panel__hint" aria-hidden="true">Esc to close · drive away to leave</p>`;

// ── Projects ──

export function projectEntry(p: Project): PanelEntry {
  return {
    id: p.id,
    short: p.short,
    title: p.title,
    html: () => {
      const actions = [
        p.links.live ? btn(p.links.live, 'Live site', true) : '',
        p.links.github ? btn(p.links.github, 'Source on GitHub', !p.links.live) : '',
        btn(p.links.classic, 'Full write-up'),
      ].join('');
      const shots = p.shots
        .map(
          (s) => `<figure class="panel__shot${s.placeholder ? ' is-placeholder' : ''}">
            <img src="${esc(s.src)}" alt="${esc(s.alt)}" width="1280" height="800" loading="lazy" decoding="async" />
            <figcaption>${esc(s.caption)}</figcaption>
          </figure>`,
        )
        .join('');
      const details = p.details.map((d) => `<section><h3>${esc(d.heading)}</h3>${d.body.map((b) => `<p>${esc(b)}</p>`).join('')}</section>`).join('');
      return `
        ${head(`${esc(p.context)} <span aria-hidden="true">·</span> ${p.team}`, p.short)}
        <h2 class="panel__title" id="panel-title" tabindex="-1">${esc(p.title)}</h2>
        <p class="panel__lede">${esc(p.oneLiner)}</p>
        <div class="panel__gallery" role="group" aria-label="Screenshots" tabindex="0">${shots}</div>
        <dl class="panel__facts">
          <div><dt>My role</dt><dd>${esc(p.role)}</dd></div>
          <div><dt>Stack</dt><dd><ul class="panel__stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></dd></div>
          <div><dt>Year</dt><dd>${p.year}</dd></div>
        </dl>
        <div class="panel__actions">${actions}</div>
        ${p.note ? `<p class="panel__note"><strong>Note.</strong> ${esc(p.note)}</p>` : ''}
        <details class="panel__more">
          <summary>Read more</summary>
          <div class="panel__details">${details}</div>
        </details>
        ${hint}`;
    },
  };
}

// ── About ──

export const aboutEntry: PanelEntry = {
  id: 'about',
  short: 'About',
  title: PROFILE.name,
  html: () => `
    ${head(`About <span aria-hidden="true">·</span> ${esc(PROFILE.city)}`, 'About')}
    <h2 class="panel__title" id="panel-title" tabindex="-1">${esc(PROFILE.name)}</h2>
    <p class="panel__lede">${esc(PROFILE.headline)}. ${esc(PROFILE.summaryFirstPerson)}</p>
    <p class="panel__status"><span class="panel__dot" aria-hidden="true"></span>${esc(PROFILE.availability)}</p>
    <div class="panel__prose">${PROFILE.bio.map((b) => `<p>${esc(b)}</p>`).join('')}</div>
    <h3 class="panel__section-title">Toolbox</h3>
    <dl class="panel__facts panel__facts--skills">
      ${PROFILE.skills.map((g) => `<div><dt>${esc(g.group)}</dt><dd><ul class="panel__stack">${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></dd></div>`).join('')}
    </dl>
    <h3 class="panel__section-title">Experience</h3>
    <ol class="panel__timeline">
      ${PROFILE.experience.map((e) => `<li><span class="panel__when">${esc(e.when)}</span><span><strong>${esc(e.org)}</strong> · ${esc(e.role)}<br /><span class="panel__muted">${esc(e.line)}</span></span></li>`).join('')}
    </ol>
    <h3 class="panel__section-title">Education</h3>
    <ol class="panel__timeline">
      <li><span class="panel__when">${esc(PROFILE.years)}</span><span><strong>${esc(PROFILE.degree)}</strong><br /><span class="panel__muted">${esc(PROFILE.school)}, ${esc(PROFILE.university)}</span></span></li>
      <li><span class="panel__when">${esc(PROFILE.certification.year)}</span><span><strong>${esc(PROFILE.certification.title)}</strong><br /><span class="panel__muted">${esc(PROFILE.certification.by)}</span></span></li>
    </ol>
    <div class="panel__actions">
      ${__HAS_RESUME__ ? `<a class="panel__btn panel__btn--primary" href="/resume.pdf" download="Hardik-Bhatia-Resume.pdf">Download résumé (PDF)</a>` : ''}
      ${btn(PROFILE.classic, 'Classic site', !__HAS_RESUME__, false)}
    </div>
    ${hint}`,
};

// ── Contact ──

export const contactEntry: PanelEntry = {
  id: 'contact',
  short: 'Contact',
  title: 'Let’s build it',
  html: () => `
    ${head('Contact', 'Contact')}
    <h2 class="panel__title" id="panel-title" tabindex="-1">Let’s build it.</h2>
    <p class="panel__lede">Internships, hackathon teams, freelance builds or just a good problem: my inbox is open.</p>
    <div class="panel__email">
      <span class="panel__email-label">Email</span>
      <button class="panel__copy" type="button" data-copy="${esc(PROFILE.email)}" aria-describedby="copy-status">
        <span class="panel__email-addr">${esc(PROFILE.email)}</span>
        <span class="panel__copy-tag" aria-hidden="true">Copy</span>
      </button>
      <span class="panel__copy-status" id="copy-status" role="status"></span>
    </div>
    <div class="panel__actions">
      <a class="panel__btn panel__btn--primary" href="mailto:${esc(PROFILE.email)}?subject=${encodeURIComponent('Hi Hardik')}">Say hi${ARROW_ICON}</a>
      ${btn(PROFILE.github, `GitHub · ${PROFILE.githubHandle}`)}
      ${btn(PROFILE.linkedin, 'LinkedIn')}
    </div>
    <p class="panel__muted panel__small">${esc(PROFILE.city)} · ${esc(PROFILE.availability)}</p>
    ${hint}`,
};

// ── Wins ──

export const winsEntry: PanelEntry = {
  id: 'wins',
  short: 'Wins',
  title: 'Wins',
  html: () => `
    ${head('Wins wall', 'Wins')}
    <h2 class="panel__title" id="panel-title" tabindex="-1">Wins</h2>
    <p class="panel__lede">Hackathons and datathons, as they happened.</p>
    <ol class="panel__wins">
      ${WINS.map((w) => `<li><span class="panel__when">${esc(w.year)}</span><span><strong>${esc(w.event)}</strong><br />${esc(w.fact)}</span></li>`).join('')}
    </ol>
    ${hint}`,
};
