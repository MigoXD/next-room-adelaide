"use strict";

const shelves = [
  { item: "Cookware set", category: "kitchen", artwork: "cookware", description: "A small pot and frying pan. Easy to carry home." },
  { item: "Collapsible drying rack", category: "home", artwork: "rack", description: "Folds flat. Useful if you’re short on floor space." },
  { item: "Board game bundle", category: "home", artwork: "games", description: "Two small games for a shared apartment." },
];
const waitKey = "next-room-waitlist-v1";
const legacySurveyKey = "next-room-survey-v1";
const surveyKey = "next-room-survey-v2";
const memory = new Map();

function read(key, fallback) {
  if (memory.has(key)) return memory.get(key);
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function clear(key) {
  memory.set(key, null);
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const waitForm = document.querySelector("#wait-form");
const waitStatus = document.querySelector("#wait-status");
const saved = document.querySelector("#saved");
const waitEntries = document.querySelector("#wait-entries");
const items = document.querySelector("#items");
const itemStatus = document.querySelector("#item-status");
const filters = document.querySelectorAll("[data-filter]");

function showItems(filter) {
  const visible = shelves.filter(({ category }) => filter === "all" || category === filter);
  items.replaceChildren();
  for (const { item, artwork, description } of visible) {
    const card = document.createElement("article");
    card.className = "item";
    card.innerHTML = '<div class="product" aria-hidden="true"><div class="product-object"></div></div><div class="item-body"><h3></h3><p></p><button class="text-link" type="button">Try claiming</button></div>';
    card.firstElementChild.classList.add(artwork);
    card.querySelector("h3").textContent = item;
    card.querySelector("p").textContent = description;
    const claim = card.querySelector("button");
    claim.setAttribute("aria-label", "Try claiming: " + item);
    claim.addEventListener("click", () => {
      waitForm.elements.role.value = "collect";
      waitForm.elements.namedItem("item").value = item;
      waitStatus.textContent = "Demo selection: " + item + ". Choose your timing to continue.";
      document.querySelector("#waitlist").scrollIntoView();
      waitForm.elements.timing.focus({ preventScroll: true });
    });
    items.append(card);
  }
  itemStatus.textContent = visible.length + (visible.length === 1 ? " demo listing." : " demo listings.");
}

function showWaitlist() {
  const entries = read(waitKey, []);
  saved.hidden = entries.length === 0;
  waitEntries.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = [entry.role === "collect" ? "Collect" : "Offer", entry.item, entry.timing].join(" · ");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text-link";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + label.textContent);
    remove.addEventListener("click", () => {
      const persisted = save(waitKey, read(waitKey, []).filter(record => record.id !== entry.id));
      waitStatus.textContent = persisted ? "Demo preference removed." : "Demo preference removed for this session.";
      showWaitlist();
      waitForm.elements.role.focus();
    });
    row.append(label, remove);
    waitEntries.append(row);
  }
}

for (const filter of filters) {
  filter.addEventListener("click", () => {
    for (const chip of filters) chip.setAttribute("aria-pressed", String(chip === filter));
    showItems(filter.dataset.filter);
  });
}

waitForm.addEventListener("submit", event => {
  event.preventDefault();
  const entry = Object.fromEntries(new FormData(waitForm));
  const entries = read(waitKey, []);
  if (entries.some(record => record.role === entry.role && record.item === entry.item && record.timing === entry.timing)) {
    waitStatus.textContent = "You’ve already saved this demo preference.";
    return;
  }
  entry.id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const persisted = save(waitKey, [...entries, entry]);
  waitStatus.textContent = persisted ? "Demo preference saved on this browser." : "Browser storage is unavailable. This preference will last until you close or reload the page.";
  waitForm.reset();
  showWaitlist();
});

const surveyForm = document.querySelector("#survey-form");
const surveyStatus = document.querySelector("#survey-status");
const exportButton = document.querySelector("#export");
const clearButton = document.querySelector("#clear-response");
const legacyFields = ["submitted_at", "role", "items", "barrier", "lobby", "window", "comment"];
const surveyFields = ["submitted_at", "role", "outgoing", "incoming", "barrier", "lobby", "window", "comment"];
const moveQuestions = surveyForm.querySelectorAll("[data-move]");
const scopeMessage = document.querySelector("#survey-ineligible");
const legacyResponse = document.querySelector("#legacy-response");

function showMoveQuestions() {
  const role = surveyForm.elements.role.value;
  const visible = {
    in: role === "Moved in" || role === "Moved in and out",
    out: role === "Moved out" || role === "Moved in and out",
    any: role !== "" && role !== "Neither",
  };
  for (const question of moveQuestions) {
    const hidden = !visible[question.dataset.move];
    question.hidden = hidden;
    if (question.matches("select, textarea")) question.disabled = hidden;
  }
  scopeMessage.hidden = role !== "Neither";
}

function showResponse() {
  const response = read(surveyKey, null);
  exportButton.disabled = !response;
  clearButton.hidden = !response;
  if (response) {
    for (const key of surveyFields.slice(1)) surveyForm.elements[key].value = response[key] ?? "";
  }
  showMoveQuestions();
}

surveyForm.addEventListener("change", event => {
  if (event.target.name === "role") showMoveQuestions();
});

surveyForm.addEventListener("submit", event => {
  event.preventDefault();
  const response = Object.fromEntries(new FormData(surveyForm));
  response.submitted_at = new Date().toISOString();
  const persisted = save(surveyKey, response);
  surveyStatus.textContent = persisted
    ? "Response saved on this browser. You can download it to share yourself."
    : "Browser storage is unavailable. Download your response before you close or reload the page.";
  showResponse();
});

function csvCell(value) {
  const literal = /^[\s]*[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + literal.replaceAll('"', '""') + '"';
}

function downloadResponse(key, fields, filename) {
  const response = read(key, null);
  if (!response) return;
  const csv = fields.join(",") + "\r\n" + fields.map(field => csvCell(response[field] ?? "")).join(",") + "\r\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

exportButton.addEventListener("click", () => downloadResponse(surveyKey, surveyFields, "next-room-response-v2.csv"));
document.querySelector("#legacy-export").addEventListener("click", () => downloadResponse(legacySurveyKey, legacyFields, "next-room-response-v1.csv"));
document.querySelector("#legacy-clear").addEventListener("click", () => {
  const persisted = clear(legacySurveyKey);
  legacyResponse.hidden = true;
  surveyStatus.textContent = persisted ? "Earlier response deleted from this browser." : "Earlier response cleared for this session.";
  surveyForm.querySelector("input").focus();
});

clearButton.addEventListener("click", () => {
  const persisted = clear(surveyKey);
  surveyForm.reset();
  showResponse();
  surveyStatus.textContent = persisted ? "Saved response deleted from this browser." : "Saved response cleared for this session.";
  surveyForm.querySelector("input").focus();
});

showItems("all");
showWaitlist();
showResponse();
legacyResponse.hidden = !read(legacySurveyKey, null);

waitForm.querySelector("[type=submit]").disabled = false;
surveyForm.querySelector("[type=submit]").disabled = false;
