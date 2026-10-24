"use strict";

const form = document.getElementById("search-form");
const list = document.getElementById("issue-list");
const statusMessage = document.getElementById("status-message");
const resultCount = document.getElementById("result-count");
const searchButton = document.getElementById("search-button");
const sortOrder = document.getElementById("sort-order");
const savedToggle = document.getElementById("saved-toggle");
const skillsField = document.getElementById("skills");
const skillsHint = document.getElementById("skills-hint");
const savedKey = "patchwork.savedIssues.v1";

let currentIssues = [];
let isSavedView = false;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSavedIssues() {
  try {
    const value = JSON.parse(localStorage.getItem(savedKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function saveIssues(issues) {
  localStorage.setItem(savedKey, JSON.stringify(issues.slice(0, 50)));
}

function updateSavedToggle() {
  const count = getSavedIssues().length;
  savedToggle.setAttribute("aria-pressed", String(isSavedView));
  savedToggle.innerHTML = (isSavedView ? '<span aria-hidden="true">←</span> All issues' : '<span aria-hidden="true">♡</span> Saved')
    + ' <span id="saved-count" class="saved-count">' + count + "</span>";
}

function relativeDate(dateString) {
  const timestamp = Date.parse(dateString || "");
  if (!Number.isFinite(timestamp)) return "Date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return "Updated " + days + " days ago";
  const months = Math.floor(days / 30);
  if (months < 12) return "Updated " + months + (months === 1 ? " month ago" : " months ago");
  const years = Math.floor(months / 12);
  return "Updated " + years + (years === 1 ? " year ago" : " years ago");
}

function repoInitial(repo) {
  const lastPart = String(repo || "").split("/").pop() || "G";
  return escapeHtml(lastPart.slice(0, 1).toUpperCase());
}

function safeGithubUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "github.com" ? parsed.href : "https://github.com/";
  } catch (_error) {
    return "https://github.com/";
  }
}

function renderLabels(labels) {
  return (labels || []).slice(0, 3).map((label) => {
    const name = escapeHtml(label.name);
    const color = /^[0-9a-f]{6}$/i.test(label.color || "") ? label.color : "8fa69a";
    return '<span class="issue-label"><span class="label-dot" style="background:#' + escapeHtml(color) + '"></span>' + name + "</span>";
  }).join("");
}

function renderReasons(issue) {
  const reasons = Array.isArray(issue.reasons) ? issue.reasons.slice(0, 3) : [];
  const details = reasons.length
    ? reasons.map((reason) => "<span>" + escapeHtml(reason) + "</span>").join('<span class="reason-separator" aria-hidden="true">·</span>')
    : "<span>Open issue selected for your search</span>";
  return '<div class="fit-row"><span class="fit-label">Why it may fit</span><span class="fit-explanation">' + details + "</span></div>";
}

function issueCard(issue) {
  const saved = getSavedIssues().some((item) => String(item.id) === String(issue.id));
  const safeUrl = safeGithubUrl(issue.url);
  const comments = Number(issue.comments || 0);
  const checkClass = issue.claimCheck === "needs-check"
    ? "meta-check unchecked"
    : comments === 0 ? "meta-check neutral" : "meta-check";
  const checkText = issue.claimCheck === "needs-check"
    ? "Check comments before claiming"
    : comments > 0 ? "No claim found in recent comments" : "No comments yet";
  return [
    '<article class="issue-card">',
      '<div class="issue-meta-top">',
        '<div class="repo-line"><span class="repo-glyph">' + repoInitial(issue.repo) + '</span><span class="repo-name">' + escapeHtml(issue.repo || "Open-source repository") + '</span></div>',
        '<span class="issue-number">#' + escapeHtml(issue.number) + '</span>',
      '</div>',
      '<div class="issue-title-row">',
        '<h3 class="issue-title"><a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(issue.title) + '</a></h3>',
        '<button class="save-button' + (saved ? " saved" : "") + '" type="button" data-save-id="' + escapeHtml(issue.id) + '" aria-label="' + (saved ? "Remove saved issue" : "Save issue") + '" title="' + (saved ? "Remove from saved issues" : "Save issue") + '">' + (saved ? "♥" : "♡") + '</button>',
      '</div>',
      '<p class="issue-description">' + escapeHtml(issue.bodyPreview || "No description provided.") + '</p>',
      '<div class="label-row">' + renderLabels(issue.labels) + '</div>',
      renderReasons(issue),
      '<div class="issue-bottom">',
        '<div class="freshness-meta"><span>' + escapeHtml(relativeDate(issue.updatedAt)) + '</span><span class="' + checkClass + '">' + escapeHtml(checkText) + '</span></div>',
        '<div class="issue-actions"><a class="open-issue" href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noreferrer">Open on GitHub <span aria-hidden="true">↗</span></a></div>',
      '</div>',
    '</article>'
  ].join("");
}

function renderEmpty(title, description) {
  list.innerHTML = '<div class="empty-state"><div class="empty-icon" aria-hidden="true">⌕</div><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(description) + "</p></div>";
}

function showStatus(message, visible) {
  statusMessage.textContent = message || "";
  statusMessage.classList.toggle("visible", Boolean(visible && message));
}

function currentFilters() {
  const params = new URLSearchParams();
  params.set("language", document.getElementById("language").value);
  params.set("skills", document.getElementById("skills").value.trim());
  params.set("level", document.getElementById("level").value);
  params.set("freshDays", document.getElementById("fresh-days").value);
  params.set("limit", "24");
  return params;
}

function sortedIssues(issues) {
  const copy = issues.slice();
  if (sortOrder.value === "fresh") {
    copy.sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
  } else {
    copy.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }
  return copy;
}

function drawResults() {
  let issues = currentIssues;
  if (isSavedView) {
    const saved = getSavedIssues();
    const savedIds = new Set(saved.map((issue) => String(issue.id)));
    const visible = currentIssues.filter((issue) => savedIds.has(String(issue.id)));
    issues = visible.length ? visible : saved;
  }
  issues = sortedIssues(issues);
  resultCount.textContent = issues.length ? "— " + issues.length + " found" : "";
  updateSavedToggle();
  if (!issues.length) {
    renderEmpty(
      isSavedView ? "No saved issues yet" : "No close matches just yet",
      isSavedView ? "Tap the heart on an issue to keep it here for later." : "Try Any language, add a skill you know, or open Advanced filters to see a wider range."
    );
    return;
  }
  list.innerHTML = issues.map(issueCard).join("");
}

function showLoading() {
  list.innerHTML = [
    '<div class="loading-card" aria-hidden="true"><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div></div>',
    '<div class="loading-card" aria-hidden="true"><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div></div>',
    '<div class="loading-card" aria-hidden="true"><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div></div>'
  ].join("");
}

async function loadIssues() {
  isSavedView = false;
  updateSavedToggle();
  showStatus("", false);
  searchButton.disabled = true;
  searchButton.querySelector("span:first-child").textContent = "Finding beginner issues…";
  showLoading();
  resultCount.textContent = "";
  try {
    if (window.location.protocol === "file:") {
      renderEmpty(
        "Start Patchwork to see issues",
        "This page is open directly from a file. Run npm start in the project folder, then visit localhost:3000 to load GitHub issues."
      );
      return;
    }
    const response = await fetch("/api/issues?" + currentFilters().toString(), {
      headers: { Accept: "application/json" }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load issues.");
    currentIssues = Array.isArray(payload.issues) ? payload.issues : [];
    drawResults();
    if (payload.meta && payload.meta.hiddenClaimed > 0) {
      const count = payload.meta.hiddenClaimed;
      showStatus(count + " issue" + (count === 1 ? " was" : "s were") + " hidden because recent comments looked like a claim. Remaining listings still need a final check on GitHub.", true);
    }
  } catch (error) {
    currentIssues = [];
    renderEmpty("We couldn’t reach GitHub", error.message || "Check your connection and try again.");
    showStatus("The issue search could not finish. GitHub may be rate-limiting requests; wait a few minutes and try again.", true);
  } finally {
    searchButton.disabled = false;
    searchButton.querySelector("span:first-child").textContent = "Find beginner issues";
  }
}

function toggleSaved(issueId) {
  const saved = getSavedIssues();
  const existing = saved.findIndex((issue) => String(issue.id) === String(issueId));
  if (existing >= 0) {
    saved.splice(existing, 1);
  } else {
    const issue = currentIssues.find((item) => String(item.id) === String(issueId));
    if (issue) saved.unshift(issue);
  }
  saveIssues(saved);
  drawResults();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadIssues();
});

sortOrder.addEventListener("change", drawResults);
savedToggle.addEventListener("click", () => {
  isSavedView = !isSavedView;
  drawResults();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-save-id]");
  if (!button) return;
  toggleSaved(button.getAttribute("data-save-id"));
});

document.querySelectorAll(".skill-chip").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.getAttribute("data-skill");
    const current = skillsField.value.split(",").map((part) => part.trim()).filter(Boolean);
    const existing = current.findIndex((skill) => skill.toLowerCase() === value.toLowerCase());
    if (existing >= 0) {
      current.splice(existing, 1);
      skillsHint.textContent = "Removed " + button.textContent.trim() + ". Choose Find beginner issues when you’re ready.";
    } else {
      current.push(value);
      skillsHint.textContent = "Added " + button.textContent.trim() + ". Choose Find beginner issues when you’re ready.";
    }
    skillsField.value = current.join(", ");
    syncSkillChips();
  });
});

function syncSkillChips() {
  const selected = new Set(skillsField.value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean));
  document.querySelectorAll(".skill-chip").forEach((button) => {
    const active = selected.has(String(button.getAttribute("data-skill") || "").toLowerCase());
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("selected", active);
  });
}

skillsField.addEventListener("input", syncSkillChips);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.getElementById("skills").focus();
  }
});

updateSavedToggle();
syncSkillChips();
loadIssues();
