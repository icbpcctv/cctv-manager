const APP_VERSION = "0.7.5";
const KAKAO_EXTERNAL_MAP_URL = "https://map.kakao.com/";
const DEFAULT_MAP_CENTER = { lat: 37.5070, lng: 126.7218 };
const DEFAULT_MAP_LABEL = "부평구청";

const SETTINGS_KEY = "cctv_settings_v4";
const REALTIME_KEY = "cctv_realtime_records_v2";
const CIVIL_KEY = "cctv_civil_records_v2";
const POLICE_KEY = "cctv_police_records_v2";
const VIDEO_KEY = "cctv_video_records_v2";
const INFO_KEY = "cctv_info_records_v2";
const PERSONAL_SPECIAL_KEY = "cctv_personal_specials_v2";
const TEAM_SPECIAL_KEY = "cctv_team_specials_v2";
const LAST_BACKUP_KEY = "cctv_last_backup_v2";

const DEFAULT_TEAMS = {
  "1조": [],
  "2조": [],
  "3조": [],
  "4조": [],
};

const DEFAULT_SETTINGS = {
  activeTeam: "1조",
  currentUser: "",
  theme: "ios-blue",
  teamName: "1조",
  teams: { ...DEFAULT_TEAMS },
  members: [],
  baseDate: "2026-04-01",
  baseShift: "비번",
  shiftPattern: ["비번", "휴무", "오전", "오전", "오후", "오후", "야간", "야간"],
};

const realtimeCategories = ["강력", "경범죄", "청소년", "재난", "교통사고", "기타"];
const civilTypes = ["비상벨대응", "비상벨기타", "비상벨계도", "민원-나", "민원-대리", "정보공개"];
const policeCategories = ["강력", "경범죄", "청소년", "재난", "실종", "교통사고", "기타"];
const videoCategories = ["강도", "폭력", "절도", "성추행", "실종", "교통사고", "기타"];

let settings = mergeSettings(readJson(SETTINGS_KEY, readJson("cctv_settings_v3", readJson("cctv_settings_v2", {}))));
let realtimeRecords = readJson(REALTIME_KEY, []);
let civilRecords = readJson(CIVIL_KEY, []);
let policeRecords = readJson(POLICE_KEY, []);
let videoRecords = readJson(VIDEO_KEY, []);
let infoRecords = readJson(INFO_KEY, []);
let personalSpecials = readJson(PERSONAL_SPECIAL_KEY, []);
let teamSpecials = readJson(TEAM_SPECIAL_KEY, []);
let lastBackup = readJson(LAST_BACKUP_KEY, null);

let currentPeriodDate = new Date();
let editState = null;
let kakaoMap = null;
let kakaoMarker = null;
let kakaoInfoWindow = null;
let kakaoPlaces = null;
let kakaoGeocoder = null;
let kakaoMapReady = false;

const $ = (id) => document.getElementById(id);

init();

function init() {
  bindTabs();
  bindQuickAdd();
  bindMapControls();
  bindListModal();
  bindForms();
  bindDynamicForms();
  bindUppercaseManageInputs();
  bindMonth();
  bindBackup();
  bindSettings();
  applyTheme();
  saveAll();
  renderAll();
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch (error) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function saveAll() {
  saveJson(SETTINGS_KEY, settings);
  saveJson(REALTIME_KEY, realtimeRecords);
  saveJson(CIVIL_KEY, civilRecords);
  saveJson(POLICE_KEY, policeRecords);
  saveJson(VIDEO_KEY, videoRecords);
  saveJson(INFO_KEY, infoRecords);
  saveJson(PERSONAL_SPECIAL_KEY, personalSpecials);
  saveJson(TEAM_SPECIAL_KEY, teamSpecials);
}

function mergeSettings(source) {
  const next = { ...DEFAULT_SETTINGS, ...(source || {}) };

  if (!Array.isArray(next.shiftPattern) || !next.shiftPattern.length) {
    next.shiftPattern = [...DEFAULT_SETTINGS.shiftPattern];
  }

  if (!next.teams || typeof next.teams !== "object") {
    next.teams = { ...DEFAULT_TEAMS };
  }

  Object.keys(DEFAULT_TEAMS).forEach((team) => {
    if (!Array.isArray(next.teams[team])) next.teams[team] = [];
  });

  if (Array.isArray(next.members) && next.members.length && !next.teams[next.teamName || "1조"]?.length) {
    const oldTeam = next.teamName || "1조";
    next.teams[oldTeam] = next.members.slice(0, 4);
  }

  if (!next.activeTeam) next.activeTeam = next.teamName || "1조";
  if (!next.teams[next.activeTeam]) next.activeTeam = "1조";

  next.teamName = next.activeTeam;
  next.members = next.teams[next.activeTeam] || [];

  if (!next.theme) next.theme = "ios-blue";

  if (!next.currentUser || !next.members.includes(next.currentUser)) {
    next.currentUser = next.members[0] || "";
  }

  return next;
}

function makeId() {
  return Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function todayString() {
  return dateString(getWorkDate(new Date()));
}

function getWorkDate(date) {
  const current = new Date(date);
  const previous = new Date(current);
  previous.setDate(current.getDate() - 1);

  if (current.getHours() < 9 && getShift(previous) === "야간") {
    return previous;
  }

  return current;
}

function dateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeString() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function ymString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function yearString(date) {
  return String(date.getFullYear());
}

function parseDateOnly(value) {
  const safe = value || todayString();
  const [y, m, d] = safe.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getShift(date) {
  const pattern = settings.shiftPattern.length ? settings.shiftPattern : DEFAULT_SETTINGS.shiftPattern;
  const base = parseDateOnly(settings.baseDate);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.floor((target - base) / (1000 * 60 * 60 * 24));
  const baseIndex = Math.max(0, pattern.indexOf(settings.baseShift));
  const index = ((baseIndex + diff) % pattern.length + pattern.length) % pattern.length;
  return pattern[index];
}

function setShiftClass(shift) {
  const el = $("headerShiftBadge");
  el.className = "shiftBadge";
  if (shift === "비번" || shift === "휴무") el.classList.add("off");
  if (shift === "오전") el.classList.add("day");
  if (shift === "오후") el.classList.add("evening");
  if (shift === "야간") el.classList.add("night");
}

function formatHeaderDate() {
  const d = getWorkDate(new Date());
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${days[d.getDay()]})`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return value.replace("T", " ");
}

function bindTabs() {
  document.querySelectorAll(".bottomTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      if (!page) return;

      document.querySelectorAll(".bottomTab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      $(page).classList.add("active");

      closeQuickDial();
      renderAll();

      if (page === "mapPage") {
        setTimeout(initMapPage, 80);
        setTimeout(initMapPage, 280);
        setTimeout(initMapPage, 700);
      }
    });
  });
}


function bindMapControls() {
  const searchBtn = $("mapSearchBtn");
  const searchInput = $("mapSearchInput");
  const currentBtn = $("mapCurrentBtn");
  const externalBtn = $("mapOpenExternalBtn");
  const locateFloatBtn = $("mapLocateFloat");

  if (searchBtn) {
    searchBtn.addEventListener("click", searchKakaoMap);
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchKakaoMap();
      }
    });
  }

  if (currentBtn) {
    currentBtn.addEventListener("click", () => {
      initMapPage(() => {
        moveKakaoMap(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng, DEFAULT_MAP_LABEL);
      });
    });
  }

  if (externalBtn) {
    externalBtn.addEventListener("click", () => {
      window.open(KAKAO_EXTERNAL_MAP_URL, "_blank", "noopener,noreferrer");
    });
  }

  if (locateFloatBtn) {
    locateFloatBtn.addEventListener("click", moveToCurrentLocation);
  }
}

function moveToCurrentLocation() {
  if (!navigator.geolocation) {
    setMapStatus("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다.");
    return;
  }

  setMapStatus("현재 위치를 확인하는 중입니다.");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      initMapPage(() => {
        moveKakaoMap(lat, lng, "현재 위치");
      });
    },
    () => {
      setMapStatus("현재 위치 권한이 거부되었거나 위치를 가져오지 못했습니다.");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000,
    },
  );
}

function initMapPage(afterReady) {
  const canvas = $("mapCanvas");
  let inner = $("kakaoMapInner");

  if (!canvas) return;

  if (!inner) {
    inner = document.createElement("div");
    inner.id = "kakaoMapInner";
    inner.className = "kakaoMapInner";
    canvas.prepend(inner);
  }

  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    setTimeout(() => initMapPage(afterReady), 180);
    return;
  }

  if (!window.kakao || !window.kakao.maps) {
    showMapLoadFail();
    return;
  }

  try {
    window.kakao.maps.load(() => {
      try {
        if (kakaoMapReady && kakaoMap) {
          canvas.classList.add("loaded");
          kakaoMap.relayout();

          if (typeof afterReady === "function") {
            afterReady();
          }

          return;
        }

        const center = new window.kakao.maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng);

        inner.innerHTML = "";

        kakaoMap = new window.kakao.maps.Map(inner, {
          center,
          level: 4,
        });

        kakaoMarker = new window.kakao.maps.Marker({
          position: center,
          map: kakaoMap,
        });

        kakaoInfoWindow = new window.kakao.maps.InfoWindow({
          content: `<div class="mapInfoWindow">${DEFAULT_MAP_LABEL}</div>`,
        });

        kakaoInfoWindow.open(kakaoMap, kakaoMarker);

        kakaoPlaces = new window.kakao.maps.services.Places();
        kakaoGeocoder = new window.kakao.maps.services.Geocoder();

        kakaoMapReady = true;
        canvas.classList.add("loaded");

        kakaoMap.relayout();
        kakaoMap.setCenter(center);

        setTimeout(() => {
          if (kakaoMap) {
            kakaoMap.relayout();
          }
        }, 250);

        setMapStatus("카카오맵이 준비되었습니다. 장소 또는 주소를 검색해보세요.");

        if (typeof afterReady === "function") {
          afterReady();
        }
      } catch (error) {
        setMapStatus("지도 초기화 오류입니다. JavaScript 키와 등록 도메인을 확인해주세요.");
      }
    });
  } catch (error) {
    setMapStatus("지도 실행 중 오류가 발생했습니다. 페이지를 새로고침해주세요.");
  }
}

function showMapLoadFail() {
  const canvas = $("mapCanvas");
  const loading = canvas ? canvas.querySelector(".mapLoading") : null;

  if (loading) {
    loading.innerHTML = `
      <div class="mapErrorBox">
        <strong>카카오맵을 불러오지 못했습니다.</strong>
        <span>SDK 테스트에서 코드가 보이면 새로고침 후 다시 지도 탭을 눌러주세요.</span>
        <small>도메인: https://icbpcctv.github.io</small>
      </div>
    `;
  }

  setMapStatus("카카오 SDK가 아직 앱 화면에 적용되지 않았습니다. 새로고침 후 다시 시도해주세요.");
}

function searchKakaoMap() {
  const input = $("mapSearchInput");
  const keyword = input ? input.value.trim() : "";

  if (!keyword) {
    setMapStatus("검색어를 입력해주세요.");
    return;
  }

  initMapPage(() => {
    if (!kakaoPlaces || !kakaoGeocoder) {
      setMapStatus("검색 서비스를 준비하지 못했습니다.");
      return;
    }

    setMapStatus(`"${keyword}" 검색 중...`);
    $("mapResultList").innerHTML = "";

    kakaoPlaces.keywordSearch(keyword, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK && data.length) {
        renderMapResults(data);
        const first = data[0];
        moveKakaoMap(Number(first.y), Number(first.x), first.place_name, first.road_address_name || first.address_name);
        return;
      }

      kakaoGeocoder.addressSearch(keyword, (result, addressStatus) => {
        if (addressStatus === window.kakao.maps.services.Status.OK && result.length) {
          const first = result[0];
          const item = {
            place_name: keyword,
            x: first.x,
            y: first.y,
            road_address_name: first.road_address?.address_name || "",
            address_name: first.address?.address_name || keyword,
          };

          renderMapResults([item]);
          moveKakaoMap(Number(first.y), Number(first.x), keyword, item.road_address_name || item.address_name);
          return;
        }

        setMapStatus("검색 결과가 없습니다. 검색어를 조금 더 구체적으로 입력해보세요.");
      });
    });
  });
}

function renderMapResults(list) {
  const target = $("mapResultList");
  if (!target) return;

  target.innerHTML = list.slice(0, 10).map((item, idx) => {
    const title = item.place_name || item.address_name || "검색 결과";
    const address = item.road_address_name || item.address_name || "";
    return `
      <button class="mapResultItem" type="button" data-lat="${escapeHtml(item.y)}" data-lng="${escapeHtml(item.x)}" data-title="${escapeHtml(title)}" data-address="${escapeHtml(address)}">
        <span>${idx + 1}</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(address)}</small>
      </button>
    `;
  }).join("");

  target.querySelectorAll(".mapResultItem").forEach((btn) => {
    btn.addEventListener("click", () => {
      moveKakaoMap(
        Number(btn.dataset.lat),
        Number(btn.dataset.lng),
        btn.dataset.title,
        btn.dataset.address,
      );
    });
  });

  setMapStatus(`${Math.min(list.length, 10)}개의 검색 결과가 있습니다.`);
}

function moveKakaoMap(lat, lng, title, address = "") {
  if (!kakaoMap || !window.kakao) return;

  const position = new window.kakao.maps.LatLng(lat, lng);

  kakaoMap.setCenter(position);
  kakaoMap.setLevel(3);

  if (!kakaoMarker) {
    kakaoMarker = new window.kakao.maps.Marker({ map: kakaoMap });
  }

  kakaoMarker.setPosition(position);
  kakaoMarker.setMap(kakaoMap);

  if (!kakaoInfoWindow) {
    kakaoInfoWindow = new window.kakao.maps.InfoWindow();
  }

  kakaoInfoWindow.setContent(`
    <div class="mapInfoWindow">
      <strong>${escapeHtml(title || "선택 위치")}</strong>
      ${address ? `<small>${escapeHtml(address)}</small>` : ""}
    </div>
  `);
  kakaoInfoWindow.open(kakaoMap, kakaoMarker);

  setMapStatus(`${title || "선택 위치"}로 이동했습니다.`);
}

function setMapStatus(text) {
  const el = $("mapStatusText");
  if (el) el.textContent = text;
}


function bindQuickAdd() {
  $("quickAddBtn").addEventListener("click", () => {
    $("quickDialWrap").classList.toggle("open");
    $("quickBackdrop").classList.toggle("show");
  });

  $("quickBackdrop").addEventListener("click", closeQuickDial);

  document.querySelectorAll(".dialItem").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeQuickDial();
      openInputModal(btn.dataset.type);
    });
  });

  $("closeInputModal").addEventListener("click", closeInputModal);
}


function bindListModal() {
  document.addEventListener("click", (event) => {
    const cellTrigger = event.target.closest("th[data-list-key], td[data-list-key]");
    const trigger = cellTrigger || event.target.closest("button[data-list-key], .clickableStatus[data-list-key]");
    if (!trigger) return;

    const key = trigger.dataset.listKey;
    if (!key) return;

    event.preventDefault();
    event.stopPropagation();

    openListModal(key, {
      category: trigger.dataset.category || "",
    });
  });

  $("closeListModal").addEventListener("click", closeListModal);
}

function closeQuickDial() {
  $("quickDialWrap").classList.remove("open");
  $("quickBackdrop").classList.remove("show");
}

function bindForms() {
  $("deleteRecordBtn").addEventListener("click", deleteCurrentRecord);
  $("formRealtime").addEventListener("submit", saveRealtimeRecord);
  $("formCivil").addEventListener("submit", saveCivilRecord);
  $("formPolice").addEventListener("submit", savePoliceRecord);
  $("formVideo").addEventListener("submit", saveVideoRecord);
  $("formInfo").addEventListener("submit", saveInfoRecord);
}

function bindDynamicForms() {
  $("civilType").addEventListener("change", updateCivilFields);
  $("civilPhoneOwner").addEventListener("change", updateCivilFields);
  $("policeAgency").addEventListener("change", updatePoliceAgencyFields);
  $("videoApprovalCheck").addEventListener("change", updateVideoFields);
  $("videoDestroyCheck").addEventListener("change", updateVideoFields);
}


function bindUppercaseManageInputs() {
  ["rtManageNo", "civilManageNo", "policeManageNo", "infoManageNo"].forEach((id) => {
    const input = $(id);
    if (!input) return;

    input.addEventListener("input", () => {
      const before = input.value;
      const next = before.replace(/[^a-zA-Z0-9,\s]/g, "").toUpperCase();

      if (before !== next) {
        const cursor = input.selectionStart;
        input.value = next;

        try {
          input.setSelectionRange(cursor, cursor);
        } catch (error) {}
      }
    });
  });
}

function bindMonth() {
  $("prevPeriodBtn").addEventListener("click", () => {
    const mode = $("periodMode").value;
    if (mode === "month") currentPeriodDate.setMonth(currentPeriodDate.getMonth() - 1);
    if (mode === "year") currentPeriodDate.setFullYear(currentPeriodDate.getFullYear() - 1);
    syncPeriodInputs();
    renderMonthPage();
  });

  $("nextPeriodBtn").addEventListener("click", () => {
    const mode = $("periodMode").value;
    if (mode === "month") currentPeriodDate.setMonth(currentPeriodDate.getMonth() + 1);
    if (mode === "year") currentPeriodDate.setFullYear(currentPeriodDate.getFullYear() + 1);
    syncPeriodInputs();
    renderMonthPage();
  });

  $("periodMode").addEventListener("change", () => {
    updatePeriodModeUi();
    renderMonthPage();
  });

  $("periodMonthPicker").addEventListener("change", () => {
    if (!$("periodMonthPicker").value) return;
    const [y, m] = $("periodMonthPicker").value.split("-").map(Number);
    currentPeriodDate = new Date(y, m - 1, 1);
    renderMonthPage();
  });

  $("periodYearPicker").addEventListener("change", () => {
    const y = Number($("periodYearPicker").value);
    if (!y) return;
    currentPeriodDate = new Date(y, 0, 1);
    renderMonthPage();
  });

  $("exportExcelBtn").addEventListener("click", exportCurrentPeriodCsv);
  $("exportPdfBtn").addEventListener("click", () => window.print());
}

function bindBackup() {
  $("backupExportBtn").addEventListener("click", exportBackup);
  $("backupImportInput").addEventListener("change", importBackup);
  $("resetDataBtn").addEventListener("click", resetAllRecords);
}

function bindSettings() {
  $("saveShiftSettingBtn").addEventListener("click", saveShiftSettings);
  $("resetShiftSettingBtn").addEventListener("click", resetShiftSettings);
  $("saveTeamSettingBtn").addEventListener("click", saveTeamSettings);
  $("saveThemeSettingBtn").addEventListener("click", saveThemeSettings);

  $("themeSelect").addEventListener("change", () => {
    settings.theme = $("themeSelect").value;
    applyTheme();
  });
$("editTeamSelect").addEventListener("change", () => {
    fillTeamInputs($("editTeamSelect").value);
  });

  $("activeTeamSelect").addEventListener("change", () => {
    const team = $("activeTeamSelect").value;
    $("editTeamSelect").value = team;
    fillTeamInputs(team);
    populateCurrentUserSelect(team);
  });
}

function renderAll() {
  applyTheme();
  renderHeader();
  renderHomeSummary();
  renderHomeDetails();
  renderMonthPage();
  renderBackupInfo();
  renderSettings();
}

function renderHeader() {
  const workDate = getWorkDate(new Date());
  const shift = getShift(workDate);
  const members = settings.teams?.[settings.activeTeam] || settings.members || [];
  const user = settings.currentUser || members[0] || "사용자 미선택";

  $("headerDateText").textContent = formatHeaderDate();
  $("headerShiftBadge").textContent = shift;
  $("headerTeamName").textContent = settings.activeTeam || settings.teamName || "1조";
  $("headerUserName").textContent = user;
  $("versionText").textContent = `현재버전 ${APP_VERSION}`;

  setShiftClass(shift);
}

function renderSettings() {
  $("settingBaseDate").value = settings.baseDate;
  $("settingBaseShift").value = settings.baseShift;
  $("settingShiftPattern").value = settings.shiftPattern.join(",");

  $("activeTeamSelect").value = settings.activeTeam;
  $("editTeamSelect").value = $("editTeamSelect").value || settings.activeTeam;
  $("themeSelect").value = settings.theme || "ios-blue";

  fillTeamInputs($("editTeamSelect").value);
  populateCurrentUserSelect(settings.activeTeam);
  renderTeamPreview();
  syncPeriodInputs();
  updatePeriodModeUi();
}

function fillTeamInputs(team) {
  const members = settings.teams[team] || [];
  $("teamMember1").value = members[0] || "";
  $("teamMember2").value = members[1] || "";
  $("teamMember3").value = members[2] || "";
  $("teamMember4").value = members[3] || "";
}

function populateCurrentUserSelect(team) {
  const select = $("currentUserSelect");
  const members = settings.teams[team] || [];

  if (!members.length) {
    select.innerHTML = '<option value="">조원 없음</option>';
    select.value = "";
    return;
  }

  select.innerHTML = members
    .map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`)
    .join("");

  if (members.includes(settings.currentUser)) {
    select.value = settings.currentUser;
  } else {
    select.value = members[0];
  }
}

function applyTheme() {
  document.body.dataset.theme = settings.theme || "ios-blue";
}

function renderTeamPreview() {
  $("allTeamsPreview").innerHTML = Object.keys(DEFAULT_TEAMS)
    .map((team) => {
      const members = settings.teams[team] || [];
      const cells = [0, 1, 2, 3]
        .map((idx) => `<em>${escapeHtml(members[idx] || "-")}</em>`)
        .join("");

      return `
        <div class="teamPreviewLine">
          <span>${escapeHtml(team)}</span>
          <strong>${cells}</strong>
        </div>
      `;
    })
    .join("");
}

function syncPeriodInputs() {
  $("periodMonthPicker").value = ymString(currentPeriodDate);
  $("periodYearPicker").value = currentPeriodDate.getFullYear();
}

function updatePeriodModeUi() {
  const mode = $("periodMode").value;
  $("periodMonthPicker").classList.toggle("hidden", mode !== "month");
  $("periodYearPicker").classList.toggle("hidden", mode !== "year");
}

function renderHomeSummary() {
  const today = todayString();
  const ym = ymString(new Date());
  renderRealtimeSummary("realtimeSummaryTable", today, ym);
  renderCivilSummary("civilSummaryTable", today, ym);
  renderPoliceSummary("policeSummaryTable", today, ym);
  renderVideoSummary("videoSummaryTable", today, ym);
}

function renderRealtimeSummary(tableId, today, ym) {
  const todayValues = realtimeCategories.map((c) => realtimeRecords.filter((r) => r.date === today && r.category === c).length);
  const monthValues = realtimeCategories.map((c) => realtimeRecords.filter((r) => r.date.startsWith(ym) && r.category === c).length);
  renderMatrixTable(tableId, realtimeCategories, [["오늘", ...todayValues, sum(todayValues)]], { hideLabelColumn: true, cellListKey: "homeRealtime" });
  setMonthHint("realtimeMonthHint", `이번달 누계 <strong>${sum(monthValues)}</strong>건`);
}

function renderCivilSummary(tableId, today, ym) {
  const todayValues = civilTypes.map((label) => countCivilByLabel(today, label));
  const monthValues = civilTypes.map((label) => countCivilByMonthLabel(ym, label));

  renderMatrixTable(tableId, civilTypes, [["오늘", ...todayValues]], { showTotal: false, hideLabelColumn: true, labelMode: "civil", cellListKey: "homeCivil" });
  setMonthHint("civilMonthHint", `이번달 누계 <strong>${sum(monthValues)}</strong>건`);
}

function renderPoliceSummary(tableId, today, ym) {
  const todayValues = policeCategories.map((c) => policeRecords.filter((r) => r.date === today && r.category === c).length);
  const monthValues = policeCategories.map((c) => policeRecords.filter((r) => r.date.startsWith(ym) && r.category === c).length);
  renderMatrixTable(tableId, policeCategories, [["오늘", ...todayValues, sum(todayValues)]], { hideLabelColumn: true, cellListKey: "homePolice" });
  setMonthHint("policeMonthHint", `이번달 누계 <strong>${sum(monthValues)}</strong>건`);
}

function renderVideoSummary(tableId, today, ym) {
  const todayValues = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => r.date === today && r.category === c)));
  const monthValues = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => r.date.startsWith(ym) && r.category === c)));
  renderMatrixTable(tableId, videoCategories, [
    ["오늘", ...todayValues, formatVideoCount(videoRecords.filter((r) => r.date === today))],
  ], { hideLabelColumn: true, cellListKey: "homeVideo" });
  setMonthHint("videoMonthHint", `이번달 누계 <strong>${formatVideoCountInline(videoRecords.filter((r) => r.date.startsWith(ym)))}건</strong>`);
}

function renderInfoSummary(tableId, today, ym) {
  const todayCount = infoRecords.filter((r) => r.date === today).length;
  const monthCount = infoRecords.filter((r) => r.date.startsWith(ym)).length;
  renderTable(tableId, ["오늘"], [[todayCount]], [0]);
  setMonthHint("infoMonthHint", `이번달 누계 <strong>${monthCount}</strong>건`);
}

function setMonthHint(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function countCivilByLabel(date, label) {
  if (label === "정보공개") {
    return infoRecords.filter((r) => r.date === date).length;
  }

  return civilRecords.filter((r) => {
    if (r.date !== date) return false;
    if (label === "민원-나") return r.type === "전화민원" && r.phoneOwner === "나";
    if (label === "민원-대리") return r.type === "전화민원" && r.phoneOwner === "대리";
    return r.type === label;
  }).length;
}

function countCivilByMonthLabel(ym, label) {
  if (label === "정보공개") {
    return infoRecords.filter((r) => r.date.startsWith(ym)).length;
  }

  return civilRecords.filter((r) => {
    if (!r.date.startsWith(ym)) return false;
    if (label === "민원-나") return r.type === "전화민원" && r.phoneOwner === "나";
    if (label === "민원-대리") return r.type === "전화민원" && r.phoneOwner === "대리";
    return r.type === label;
  }).length;
}

function formatVideoCount(list) {
  const view = list.filter((r) => r.process === "열람").length;
  const copy = list.filter((r) => r.process === "복제").length;
  return {
    html: `${list.length}<br><span class="videoSubCount">(<span class="viewCount">${view}</span>/<span class="copyCount">${copy}</span>)</span>`,
  };
}

function formatVideoCountInline(list) {
  const view = list.filter((r) => r.process === "열람").length;
  const copy = list.filter((r) => r.process === "복제").length;
  return `${list.length} (${view}/${copy})`;
}

function renderHomeDetails() {
  const today = todayString();

  renderTable("realtimeTodayTable", ["번호", "시간", "관리번호", "위치", "구분", "내용", "조치사항"],
    realtimeRecords.filter((r) => r.date === today).map((r, idx) => [idx + 1, `${r.startTime || "-"}~${r.endTime || "-"}`, r.manageNo, r.location, r.category, r.content, r.note]), [0]);

  renderTable("policeTodayTable", ["번호", "시간", "구분", "요청기관", "관리번호", "주소/위치", "내용", "조치사항"],
    policeRecords.filter((r) => r.date === today).map((r, idx) => [idx + 1, r.time, r.category, r.agency, r.manageNo, r.location, r.content, r.action]), [0]);

  renderTable("civilTodayTable", ["번호", "시간", "민원종류", "민원인정보", "관리번호", "위치", "민원내용", "조치사항"],
    civilRecords.filter((r) => r.date === today).map((r, idx) => [idx + 1, r.time, civilTitle(r), r.complainantInfo, r.manageNo, r.location, r.content, r.action]), [0]);

  renderTable("infoTodayTable", ["번호", "접수일", "접수번호", "관리번호", "청구인", "연락처", "청구내용", "비고"],
    infoRecords.filter((r) => r.date === today).map((r, idx) => [idx + 1, r.date, r.receiptNo, r.manageNo, r.claimantName, r.claimantPhone, r.content, r.note]), [0]);

  renderApprovalHome();
  renderDestroyHome();
}

function renderApprovalHome() {
  const rows = videoRecords.filter((r) => r.approval && !r.approval.completed).map((r, idx) => [
    idx + 1, formatDateTime(r.approval.visitDateTime), r.approval.org, r.approval.rank, r.approval.name,
    r.approval.phone, r.approval.docNo, r.approval.keyword, r.approval.content,
  ]);
  renderTable("approvalHomeTable", ["번호", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "공문제목키워드", "내용"], rows, [0]);
}

function renderDestroyHome() {
  const rows = videoRecords.filter((r) => r.destroy && !r.destroy.completed).map((r, idx) => [
    idx + 1, formatDateTime(r.destroy.visitDateTime), r.destroy.org, r.destroy.rank, r.destroy.name,
    r.destroy.phone, r.destroy.docNo, r.destroy.sendDocNo, r.destroy.content,
  ]);
  renderTable("destroyHomeTable", ["번호", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "발신공문번호", "내용"], rows, [0]);
}

function civilTitle(r) {
  if (r.type === "전화민원") return `민원-${r.phoneOwner || "나"}`;
  return r.type;
}

function renderMonthPage() {
  const key = getPeriodKey();
  renderMonthlyDaily(key);
  renderMonthlyPolice(key);
  renderMonthlyVideo(key);
  renderMonthlyCivil(key);
  renderMonthlyRealtime(key);
  renderMonthlySpecials(key);
  renderMonthlyDocs(key);
}

function getPeriodKey() {
  return $("periodMode").value === "month" ? ymString(currentPeriodDate) : yearString(currentPeriodDate);
}

function renderMonthlyDaily(key) {
  const realtime = realtimeRecords.filter((r) => r.date.startsWith(key)).length;
  const civil = civilRecords.filter((r) => r.date.startsWith(key)).length;
  const police = policeRecords.filter((r) => r.date.startsWith(key)).length;
  const video = videoRecords.filter((r) => r.date.startsWith(key)).length;
  const info = infoRecords.filter((r) => r.date.startsWith(key)).length;

  renderMatrixTable(
    "monthDailyTable",
    ["개인실적", "민원처리", "경찰관제", "열람복제", "정보공개"],
    [["누계", realtime, civil, police, video, info]],
    { showTotal: false, hideLabelColumn: true, cellListKey: "monthDaily" },
  );
}

function renderMonthlyPolice(key) {
  const values = policeCategories.map((c) => policeRecords.filter((r) => r.date.startsWith(key) && r.category === c).length);
  renderMatrixTable("monthPoliceTable", policeCategories, [["누계", ...values, sum(values)]], { hideLabelColumn: true, cellListKey: "monthPolice" });
}

function renderMonthlyVideo(key) {
  const values = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => r.date.startsWith(key) && r.category === c)));
  renderMatrixTable("monthVideoTable", videoCategories, [["누계", ...values, formatVideoCount(videoRecords.filter((r) => r.date.startsWith(key)))]] , { hideLabelColumn: true, cellListKey: "monthVideo" }); 
}

function renderMonthlyCivil(key) {
  const values = civilTypes.map((label) => countCivilByPeriodLabel(key, label));
  renderMatrixTable("monthCivilTable", civilTypes, [["누계", ...values]], { showTotal: false, hideLabelColumn: true, labelMode: "civil", cellListKey: "monthCivil" });
}

function renderMonthlyInfo(key) {
  const count = infoRecords.filter((r) => r.date.startsWith(key)).length;
  renderTable("monthInfoTable", ["누계"], [[count]], [0]);
}

function renderMonthlyRealtime(key) {
  const values = realtimeCategories.map((c) => realtimeRecords.filter((r) => r.date.startsWith(key) && r.category === c).length);
  renderMatrixTable("monthRealtimeTable", realtimeCategories, [["누계", ...values, sum(values)]], { hideLabelColumn: true, cellListKey: "monthRealtime" });
}

function countCivilByPeriodLabel(key, label) {
  if (label === "정보공개") {
    return infoRecords.filter((r) => r.date.startsWith(key)).length;
  }

  return civilRecords.filter((r) => {
    if (!r.date.startsWith(key)) return false;
    if (label === "민원-나") return r.type === "전화민원" && r.phoneOwner === "나";
    if (label === "민원-대리") return r.type === "전화민원" && r.phoneOwner === "대리";
    return r.type === label;
  }).length;
}

function renderMonthlySpecials(key) {
  renderTable("monthPersonalSpecialTable", ["번호", "날짜", "구분", "관리번호", "위치", "내용", "비고"],
    personalSpecials.filter((r) => r.date.startsWith(key)).map((r, idx) => [idx + 1, r.date, r.category, r.manageNo, r.location, r.content, r.note]), [0]);
  renderTable("monthTeamSpecialTable", ["번호", "날짜", "시간", "구분", "요청기관", "관리번호", "내용", "조치사항"],
    teamSpecials.filter((r) => r.date.startsWith(key)).map((r, idx) => [idx + 1, r.date, r.time, r.category, r.agency, r.manageNo, r.content, r.action]), [0]);
}

function renderMonthlyDocs(key) {
  renderTable("monthApprovalTable", ["번호", "상태", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "키워드", "내용"],
    videoRecords.filter((r) => r.date.startsWith(key) && r.approval).map((r, idx) => [
      idx + 1, r.approval.completed ? "접수완료" : "대기", formatDateTime(r.approval.visitDateTime), r.approval.org,
      r.approval.rank, r.approval.name, r.approval.phone, r.approval.docNo, r.approval.keyword, r.approval.content,
    ]), [0]);

  renderTable("monthDestroyTable", ["번호", "상태", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "발신공문번호", "내용"],
    videoRecords.filter((r) => r.date.startsWith(key) && r.destroy).map((r, idx) => [
      idx + 1, r.destroy.completed ? "접수완료" : "대기", formatDateTime(r.destroy.visitDateTime), r.destroy.org,
      r.destroy.rank, r.destroy.name, r.destroy.phone, r.destroy.docNo, r.destroy.sendDocNo, r.destroy.content,
    ]), [0]);
}


function openListModal(key, options = {}) {
  const payload = getListPayload(key, options);
  $("listModalTitle").textContent = payload.title;
  $("listModalBody").innerHTML = payload.html || '<div class="emptyList">기록 없음</div>';

  $("listModalBody").querySelectorAll("[data-edit-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.editType;
      const id = btn.dataset.editId;
      const record = findRecord(type, id);
      if (record) openInputModal(type, record);
    });
  });

  $("listModalBody").querySelectorAll("[data-date-detail]").forEach((btn) => {
    btn.addEventListener("click", () => openListModal("dateDetail", { date: btn.dataset.dateDetail }));
  });

  $("listModal").classList.add("show");
}

function closeListModal() {
  const modal = $("listModal");
  if (modal) modal.classList.remove("show");
}

function getListPayload(key, options = {}) {
  const today = todayString();
  const period = getPeriodKey();
  const map = {
    homeRealtime: { title: "오늘 실시간 개인실적", refs: realtimeRecords.filter((r) => r.date === today).map((item) => ref("realtime", item)) },
    homePolice: { title: "오늘 경찰관제요청", refs: policeRecords.filter((r) => r.date === today).map((item) => ref("police", item)) },
    homeVideo: { title: "오늘 영상열람반출", refs: videoRecords.filter((r) => r.date === today).map((item) => ref("video", item)) },
    homeCivil: { title: "오늘 민원처리", refs: civilRecords.filter((r) => r.date === today).map((item) => ref("civil", item)) },
    homeInfo: { title: "오늘 정보공개", refs: infoRecords.filter((r) => r.date === today).map((item) => ref("info", item)) },
    homeApproval: { title: "사후결재", refs: videoRecords.filter((r) => r.approval && !r.approval.completed).map((item) => ref("video", item, "사후결재")) },
    homeDestroy: { title: "파기공문", refs: videoRecords.filter((r) => r.destroy && !r.destroy.completed).map((item) => ref("video", item, "파기공문")) },
    monthRealtime: { title: "실시간 개인실적", refs: realtimeRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("realtime", item)) },
    monthPolice: { title: "경찰관제요청", refs: policeRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("police", item)) },
    monthVideo: { title: "영상열람반출", refs: videoRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("video", item)) },
    monthCivil: { title: "민원처리", refs: [...civilRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("civil", item)), ...infoRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("info", item))] },
    monthPersonalSpecial: { title: "개인특이사항", refs: personalSpecials.filter((r) => r.date.startsWith(period)).map((item) => ref("realtime", item, "개인특이")) },
    monthTeamSpecial: { title: "조특이사항", refs: teamSpecials.filter((r) => r.date.startsWith(period)).map((item) => ref("police", item, "조특이")) },
    monthApproval: { title: "사후결재", refs: videoRecords.filter((r) => r.date.startsWith(period) && r.approval).map((item) => ref("video", item, "사후결재")) },
    monthDestroy: { title: "파기공문", refs: videoRecords.filter((r) => r.date.startsWith(period) && r.destroy).map((item) => ref("video", item, "파기공문")) },
  };
  if (key === "monthDaily") return getDailyPayload(period, options.category || "");
  if (key === "dateDetail") return getDateDetailPayload(options.date);
  const data = map[key] || { title: "세부내용", refs: [] };
  const refs = options.category ? filterRefsByCategory(data.refs, options.category) : data.refs;
  const title = options.category ? `${data.title} · ${options.category || "합계"}` : data.title;
  return { title, html: renderRecordList(refs) };
}

function filterRefsByCategory(refs, category) {
  if (!category) return refs;

  return refs.filter(({ type, item }) => {
    if (category === "정보공개") return type === "info";
    if (category === "민원-나") return type === "civil" && item.type === "전화민원" && item.phoneOwner === "나";
    if (category === "민원-대리") return type === "civil" && item.type === "전화민원" && item.phoneOwner === "대리";
    if (type === "civil") return item.type === category;
    return item.category === category;
  });
}

function getDailyPayload(period, category = "") {
  if (category) {
    const refsByCategory = {
      "개인실적": realtimeRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("realtime", item)),
      "민원처리": civilRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("civil", item)),
      "민원": civilRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("civil", item)),
      "경찰관제": policeRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("police", item)),
      "열람복제": videoRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("video", item)),
      "정보공개": infoRecords.filter((r) => r.date.startsWith(period)).map((item) => ref("info", item)),
    };
    return { title: `일자별 현황 · ${category}`, html: renderRecordList(refsByCategory[category] || []) };
  }

  const dates = new Set();

  [...realtimeRecords, ...civilRecords, ...policeRecords, ...videoRecords, ...infoRecords].forEach((r) => {
    if (r.date && r.date.startsWith(period)) dates.add(r.date);
  });

  const html = Array.from(dates).sort().reverse().map((date) => {
    const rt = realtimeRecords.filter((r) => r.date === date).length;
    const cv = civilRecords.filter((r) => r.date === date).length;
    const po = policeRecords.filter((r) => r.date === date).length;
    const vi = videoRecords.filter((r) => r.date === date).length;
    const inf = infoRecords.filter((r) => r.date === date).length;

    return `<button class="dateSummaryCard" type="button" data-date-detail="${escapeHtml(date)}">
      <strong>${escapeHtml(date)}</strong>
      <div class="dateSummaryStats">
        <span>개인 ${rt}</span>
        <span>민원처리 ${cv}</span>
        <span>경찰 ${po}</span>
        <span>영상 ${vi}</span>
        <span>정보 ${inf}</span>
      </div>
    </button>`;
  }).join("");

  return { title: "일자별 현황", html };
}

function getDateDetailPayload(date) {
  const refs = [
    ...realtimeRecords.filter((r) => r.date === date).map((item) => ref("realtime", item)),
    ...civilRecords.filter((r) => r.date === date).map((item) => ref("civil", item)),
    ...policeRecords.filter((r) => r.date === date).map((item) => ref("police", item)),
    ...videoRecords.filter((r) => r.date === date).map((item) => ref("video", item)),
    ...infoRecords.filter((r) => r.date === date).map((item) => ref("info", item)),
  ];
  return { title: `${date} 세부내용`, html: renderRecordList(refs) };
}

function ref(type, item, prefix = "") { return { type, item, prefix }; }

function renderRecordList(refs) {
  if (!refs.length) return '<div class="emptyList">기록 없음</div>';
  return refs.map(({ type, item, prefix }, idx) => `<button class="recordListItem" type="button" data-edit-type="${type}" data-edit-id="${escapeHtml(item.sourceId || item.id)}"><span class="recordNo">${idx + 1}</span><span class="recordText"><strong>${escapeHtml(recordTitle(type, item, prefix))}</strong><small>${escapeHtml(recordSubText(type, item))}</small></span></button>`).join("");
}

function recordTitle(type, item, prefix = "") {
  const label = prefix ? `${prefix} · ` : "";
  if (type === "realtime") return `${label}${item.date || ""} ${item.startTime || ""} ${item.category || ""}`;
  if (type === "civil") return `${label}${item.date || ""} ${item.time || ""} ${civilTitle(item)}`;
  if (type === "police") return `${label}${item.date || ""} ${item.time || ""} ${item.category || ""}`;
  if (type === "video") return `${label}${item.date || ""} ${item.time || ""} ${item.process || ""} · ${item.category || ""}`;
  if (type === "info") return `${label}${item.date || ""} 정보공개 ${item.receiptNo || ""}`;
  return `${label}${item.date || ""}`;
}

function recordSubText(type, item) {
  if (type === "realtime") return [item.manageNo, item.location, item.content, item.note].filter(Boolean).join(" · ");
  if (type === "civil") return [item.complainantInfo, item.manageNo, item.location, item.content, item.action].filter(Boolean).join(" · ");
  if (type === "police") return [item.agency, item.manageNo, item.location, item.content, item.action].filter(Boolean).join(" · ");
  if (type === "video") return [item.content, item.approval ? "사후결재" : "", item.destroy ? "파기공문" : ""].filter(Boolean).join(" · ");
  if (type === "info") return [item.manageNo, item.claimantName, item.content, item.note].filter(Boolean).join(" · ");
  return summaryText(item);
}

function findRecord(type, id) {
  const source = { realtime: realtimeRecords, civil: civilRecords, police: policeRecords, video: videoRecords, info: infoRecords }[type];
  return source?.find((item) => item.id === id) || null;
}

function openInputModal(type, record = null) {
  document.querySelectorAll(".inputForm").forEach((form) => {
    form.classList.remove("active");
    form.reset();
  });

  editState = record ? { type, id: record.id } : null;
  toggleDeleteButton(!!record);

  const today = todayString();
  const now = timeString();

  if (type === "realtime") {
    $("modalTitle").textContent = record ? "실시간 개인실적 수정" : "실시간 개인실적 입력";
    $("formRealtime").classList.add("active");
    $("rtDate").value = record?.date || today;
    $("rtStartTime").value = record?.startTime || now;
    $("rtEndTime").value = record?.endTime || "";
    $("rtManageNo").value = record?.manageNo || "";
    $("rtLocation").value = record?.location || "";
    $("rtCategory").value = record?.category || "강력";
    $("rtContent").value = record?.content || "";
    $("rtNote").value = record?.note || "";
    $("rtPersonalSpecial").checked = false;
  }

  if (type === "civil") {
    $("modalTitle").textContent = record ? "민원처리 수정" : "민원처리 입력";
    $("formCivil").classList.add("active");
    $("civilDate").value = record?.date || today;
    $("civilTime").value = record?.time || now;
    $("civilType").value = record?.type || "비상벨대응";
    $("civilPhoneOwner").value = record?.phoneOwner || "나";
    $("civilProxyMember").value = record?.proxyMember || "";
    $("civilComplainantInfo").value = record?.complainantInfo || "";
    $("civilManageNo").value = record?.manageNo || "";
    $("civilLocation").value = record?.location || "";
    $("civilContent").value = record?.content || "";
    $("civilAction").value = record?.action || "";
    updateCivilFields();
  }

  if (type === "police") {
    $("modalTitle").textContent = record ? "경찰관제요청 수정" : "경찰관제요청 입력";
    $("formPolice").classList.add("active");
    $("policeDate").value = record?.date || today;
    $("policeTime").value = record?.time || now;
    $("policeCategory").value = record?.category || "강력";
    setPoliceAgencyValue(record?.agency || "부평상황실");
    $("policeManageNo").value = record?.manageNo || "";
    $("policeLocation").value = record?.location || "";
    $("policeContent").value = record?.content || "";
    $("policeAction").value = record?.action || "";
    updatePoliceAgencyFields();
    $("policeTeamSpecial").checked = false;
  }

  if (type === "video") {
    $("modalTitle").textContent = record ? "영상열람반출 수정" : "영상열람반출 입력";
    $("formVideo").classList.add("active");
    $("videoDate").value = record?.date || today;
    $("videoTime").value = record?.time || now;
    $("videoCategory").value = record?.category || "강도";
    $("videoProcess").value = record?.process || "열람";
    $("videoContent").value = record?.content || "";
    $("videoApprovalCheck").checked = !!record?.approval;
    $("approvalVisitDateTime").value = record?.approval?.visitDateTime || "";
    $("approvalOrg").value = record?.approval?.org || "";
    $("approvalRank").value = record?.approval?.rank || "";
    $("approvalName").value = record?.approval?.name || "";
    $("approvalPhone").value = record?.approval?.phone || "";
    $("approvalDocNo").value = record?.approval?.docNo || "";
    $("approvalKeyword").value = record?.approval?.keyword || "";
    $("approvalContent").value = record?.approval?.content || "";
    $("approvalCompleted").checked = !!record?.approval?.completed;
    $("videoDestroyCheck").checked = !!record?.destroy;
    $("destroyVisitDateTime").value = record?.destroy?.visitDateTime || "";
    $("destroyOrg").value = record?.destroy?.org || "";
    $("destroyRank").value = record?.destroy?.rank || "";
    $("destroyName").value = record?.destroy?.name || "";
    $("destroyPhone").value = record?.destroy?.phone || "";
    $("destroyDocNo").value = record?.destroy?.docNo || "";
    $("destroySendDocNo").value = record?.destroy?.sendDocNo || "";
    $("destroyContent").value = record?.destroy?.content || "";
    $("destroyCompleted").checked = !!record?.destroy?.completed;
    updateVideoFields();
  }

  if (type === "info") {
    $("modalTitle").textContent = record ? "정보공개 수정" : "정보공개 입력";
    $("formInfo").classList.add("active");
    $("infoReceiptDate").value = record?.date || today;
    $("infoReceiptNo").value = record?.receiptNo || "";
    $("infoManageNo").value = record?.manageNo || "";
    $("infoClaimantName").value = record?.claimantName || "";
    $("infoClaimantPhone").value = record?.claimantPhone || "";
    $("infoContent").value = record?.content || "";
    $("infoNote").value = record?.note || "";
  }

  closeListModal();
  $("inputModal").classList.add("show");
}

function closeInputModal() {
  $("inputModal").classList.remove("show");
  editState = null;
  toggleDeleteButton(false);
}

function toggleDeleteButton(visible) {
  const button = $("deleteRecordBtn");
  if (!button) return;
  button.classList.toggle("hidden", !visible);
}

function getRecordListByType(type) {
  return {
    realtime: realtimeRecords,
    civil: civilRecords,
    police: policeRecords,
    video: videoRecords,
    info: infoRecords,
  }[type] || null;
}

function deleteCurrentRecord() {
  if (!editState || !editState.type || !editState.id) return;

  const labels = {
    realtime: "실시간 개인실적",
    civil: "민원처리",
    police: "경찰관제요청",
    video: "영상열람반출",
    info: "정보공개",
  };

  const label = labels[editState.type] || "기록";
  const ok = confirm(`${label} 기록을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`);
  if (!ok) return;

  const list = getRecordListByType(editState.type);
  if (!list) return;

  const before = list.length;
  const filtered = list.filter((item) => item.id !== editState.id);

  if (editState.type === "realtime") realtimeRecords = filtered;
  if (editState.type === "civil") civilRecords = filtered;
  if (editState.type === "police") policeRecords = filtered;
  if (editState.type === "video") videoRecords = filtered;
  if (editState.type === "info") infoRecords = filtered;

  personalSpecials = personalSpecials.filter((item) => item.sourceId !== editState.id && item.id !== editState.id);
  teamSpecials = teamSpecials.filter((item) => item.sourceId !== editState.id && item.id !== editState.id);

  if (before === filtered.length) {
    alert("삭제할 기록을 찾지 못했습니다.");
    return;
  }

  saveAll();
  closeInputModal();
  closeListModal();
  renderAll();
  alert("삭제되었습니다.");
}

function updateCivilFields() {
  const type = $("civilType").value;
  const owner = $("civilPhoneOwner").value;
  show("civilPhoneOwnerGroup", type === "전화민원");
  show("civilProxyGroup", type === "전화민원" && owner === "대리");
  show("civilComplainantGroup", type === "전화민원");
  show("civilManageGroup", true);
  show("civilLocationGroup", type === "비상벨대응" || type === "비상벨계도" || type === "비상벨기타");
  show("civilContentGroup", true);
  show("civilActionGroup", type === "비상벨대응" || type === "비상벨계도" || type === "비상벨기타" || type === "전화민원");
}

function setPoliceAgencyValue(value) {
  const select = $("policeAgency");
  const direct = $("policeAgencyDirect");

  if (!select || !direct) return;

  const optionValues = Array.from(select.options).map((option) => option.value || option.textContent);

  if (optionValues.includes(value)) {
    select.value = value;
    direct.value = "";
  } else {
    select.value = "직접입력";
    direct.value = value || "";
  }

  updatePoliceAgencyFields();
}

function updatePoliceAgencyFields() {
  const select = $("policeAgency");
  const directGroup = $("policeAgencyDirectGroup");

  if (!select || !directGroup) return;

  directGroup.classList.toggle("hidden", select.value !== "직접입력");
}

function updateVideoFields() {
  show("approvalFields", $("videoApprovalCheck").checked);
  show("destroyFields", $("videoDestroyCheck").checked);
}

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}


function saveRecordToList(type, list, record) {
  if (editState && editState.type === type) {
    const idx = list.findIndex((item) => item.id === editState.id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...record, id: editState.id, updatedAt: new Date().toISOString() };
      return list[idx];
    }
  }
  list.push(record);
  return record;
}

function saveRealtimeRecord(e) {
  e.preventDefault();
  const record = {
    id: makeId(),
    date: $("rtDate").value || todayString(),
    startTime: $("rtStartTime").value,
    endTime: $("rtEndTime").value,
    manageNo: $("rtManageNo").value.trim(),
    location: $("rtLocation").value.trim(),
    category: $("rtCategory").value,
    content: $("rtContent").value.trim(),
    note: $("rtNote").value.trim(),
    createdAt: new Date().toISOString(),
  };
  const saved = saveRecordToList("realtime", realtimeRecords, record);
  if ($("rtPersonalSpecial").checked) personalSpecials.push({ ...saved, id: makeId(), sourceId: saved.id });
  saveAll();
  closeInputModal();
  renderAll();
}

function saveCivilRecord(e) {
  e.preventDefault();
  const record = {
    id: editState?.type === "civil" ? editState.id : makeId(),
    date: $("civilDate").value || todayString(),
    time: $("civilTime").value || timeString(),
    type: $("civilType").value,
    phoneOwner: $("civilType").value === "전화민원" ? $("civilPhoneOwner").value : "",
    proxyMember: $("civilType").value === "전화민원" ? $("civilProxyMember").value.trim() : "",
    complainantInfo: $("civilComplainantInfo").value.trim(),
    manageNo: $("civilManageNo").value.trim(),
    location: $("civilLocation").value.trim(),
    content: $("civilContent").value.trim(),
    action: $("civilAction").value.trim(),
    createdAt: new Date().toISOString(),
  };

  saveRecordToList("civil", civilRecords, record);
  saveAll();
  closeInputModal();
  renderAll();
}

function savePoliceRecord(e) {
  e.preventDefault();
  const record = {
    id: makeId(),
    date: $("policeDate").value || todayString(),
    time: $("policeTime").value || timeString(),
    category: $("policeCategory").value,
    agency: $("policeAgency").value === "직접입력" ? $("policeAgencyDirect").value.trim() : $("policeAgency").value,
    manageNo: $("policeManageNo").value.trim(),
    location: $("policeLocation").value.trim(),
    content: $("policeContent").value.trim(),
    action: $("policeAction").value.trim(),
    createdAt: new Date().toISOString(),
  };
  const saved = saveRecordToList("police", policeRecords, record);
  if ($("policeTeamSpecial").checked) teamSpecials.push({ ...saved, id: makeId(), sourceId: saved.id });
  saveAll();
  closeInputModal();
  renderAll();
}

function saveVideoRecord(e) {
  e.preventDefault();
  const record = {
    id: makeId(),
    date: $("videoDate").value || todayString(),
    time: $("videoTime").value || timeString(),
    category: $("videoCategory").value,
    process: $("videoProcess").value,
    content: $("videoContent").value.trim(),
    approval: null,
    destroy: null,
    createdAt: new Date().toISOString(),
  };

  if ($("videoApprovalCheck").checked) {
    record.approval = {
      visitDateTime: $("approvalVisitDateTime").value,
      org: $("approvalOrg").value.trim(),
      rank: $("approvalRank").value.trim(),
      name: $("approvalName").value.trim(),
      phone: $("approvalPhone").value.trim(),
      docNo: $("approvalDocNo").value.trim(),
      keyword: $("approvalKeyword").value.trim(),
      content: $("approvalContent").value.trim(),
      completed: $("approvalCompleted").checked,
    };
  }

  if ($("videoDestroyCheck").checked) {
    record.destroy = {
      visitDateTime: $("destroyVisitDateTime").value,
      org: $("destroyOrg").value.trim(),
      rank: $("destroyRank").value.trim(),
      name: $("destroyName").value.trim(),
      phone: $("destroyPhone").value.trim(),
      docNo: $("destroyDocNo").value.trim(),
      sendDocNo: $("destroySendDocNo").value.trim(),
      content: $("destroyContent").value.trim(),
      completed: $("destroyCompleted").checked,
    };
  }

  saveRecordToList("video", videoRecords, record);
  saveAll();
  closeInputModal();
  renderAll();
}

function saveInfoRecord(e) {
  e.preventDefault();
  const record = {
    id: editState?.type === "info" ? editState.id : makeId(),
    date: $("infoReceiptDate").value || todayString(),
    receiptNo: $("infoReceiptNo").value.trim(),
    manageNo: $("infoManageNo").value.trim(),
    claimantName: $("infoClaimantName").value.trim(),
    claimantPhone: $("infoClaimantPhone").value.trim(),
    content: $("infoContent").value.trim(),
    note: $("infoNote").value.trim(),
    createdAt: new Date().toISOString(),
  };

  saveRecordToList("info", infoRecords, record);
  saveAll();
  closeInputModal();
  renderAll();
}

function parseListText(value) {
  return String(value || "")
    .replace(/->/g, ",")
    .replace(/→/g, ",")
    .replace(/>/g, ",")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function saveShiftSettings() {
  const baseDate = $("settingBaseDate").value;
  const baseShift = $("settingBaseShift").value;
  const pattern = parseListText($("settingShiftPattern").value);
  const allowed = ["오전", "오후", "야간", "비번", "휴무"];
  const invalid = pattern.filter((item) => !allowed.includes(item));

  if (!baseDate) return alert("기준일을 선택해주세요.");
  if (!pattern.length) return alert("근무패턴을 입력해주세요.");
  if (invalid.length) return alert(`사용할 수 없는 근무명이 있습니다: ${invalid.join(", ")}`);
  if (!pattern.includes(baseShift)) return alert("근무패턴 안에 기준일 근무가 포함되어야 합니다.");

  settings.baseDate = baseDate;
  settings.baseShift = baseShift;
  settings.shiftPattern = pattern;
  saveAll();
  renderAll();
  alert("근무패턴이 저장되었습니다.");
}

function resetShiftSettings() {
  if (!confirm("근무패턴을 기본값으로 되돌릴까요?")) return;
  settings.baseDate = DEFAULT_SETTINGS.baseDate;
  settings.baseShift = DEFAULT_SETTINGS.baseShift;
  settings.shiftPattern = [...DEFAULT_SETTINGS.shiftPattern];
  saveAll();
  renderAll();
  alert("근무패턴이 초기화되었습니다.");
}

function saveTeamSettings() {
  const activeTeam = $("activeTeamSelect").value;
  const editTeam = $("editTeamSelect").value;

  const members = [
    $("teamMember1").value.trim(),
    $("teamMember2").value.trim(),
    $("teamMember3").value.trim(),
    $("teamMember4").value.trim(),
  ].filter(Boolean);

  settings.teams[editTeam] = members;
  settings.activeTeam = activeTeam;
  settings.teamName = activeTeam;
  settings.members = settings.teams[activeTeam] || [];

  const activeMembers = activeTeam === editTeam ? members : settings.members;
  const selectedUser = $("currentUserSelect").value;
  settings.currentUser = activeMembers.includes(selectedUser) ? selectedUser : (activeMembers[0] || "");

  saveAll();
  renderAll();
  alert("조 정보가 저장되었습니다.");
}

function saveThemeSettings() {
  settings.theme = $("themeSelect").value || "ios-blue";
  saveAll();
  applyTheme();
  alert("테마가 저장되었습니다.");
}

function createBackupPayload() {
  return {
    meta: { app: "CCTV Manager", version: APP_VERSION, exportedAt: new Date().toISOString() },
    settings,
    realtimeRecords,
    civilRecords,
    policeRecords,
    videoRecords,
    infoRecords,
    personalSpecials,
    teamSpecials,
  };
}

function exportBackup() {
  const payload = createBackupPayload();
  downloadTextFile(`cctv-manager-backup-${todayString()}.json`, JSON.stringify(payload, null, 2), "application/json");
  lastBackup = { exportedAt: payload.meta.exportedAt, version: APP_VERSION };
  saveJson(LAST_BACKUP_KEY, lastBackup);
  renderBackupInfo();
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!confirm("백업 파일을 복원할까요? 현재 데이터는 백업 내용으로 교체됩니다.")) {
        e.target.value = "";
        return;
      }
      settings = mergeSettings(parsed.settings || {});
      realtimeRecords = ensureIds(parsed.realtimeRecords || []);
      civilRecords = ensureIds(parsed.civilRecords || []);
      policeRecords = ensureIds(parsed.policeRecords || []);
      videoRecords = ensureIds(parsed.videoRecords || []);
      infoRecords = ensureIds(parsed.infoRecords || []);
      personalSpecials = ensureIds(parsed.personalSpecials || []);
      teamSpecials = ensureIds(parsed.teamSpecials || []);
      saveAll();
      renderAll();
      alert("복원이 완료되었습니다.");
    } catch (error) {
      alert("백업 파일을 읽을 수 없습니다.");
    } finally {
      e.target.value = "";
    }
  };

  reader.readAsText(file);
}

function ensureIds(list) {
  return list.map((item) => ({ ...item, id: item.id || makeId() }));
}

function resetAllRecords() {
  const typed = prompt('모든 입력 기록을 삭제합니다. 계속하려면 "초기화"라고 입력하세요.');
  if (typed !== "초기화") {
    alert("초기화가 취소되었습니다.");
    return;
  }

  const ok = confirm("실시간 개인실적, 민원처리, 경찰관제요청, 영상열람반출, 정보공개, 특이사항 기록을 모두 삭제할까요?\n근무조/테마/근무패턴 설정은 유지됩니다.");
  if (!ok) return;

  realtimeRecords = [];
  civilRecords = [];
  policeRecords = [];
  videoRecords = [];
  infoRecords = [];
  personalSpecials = [];
  teamSpecials = [];

  saveAll();
  renderAll();
  alert("입력 기록이 모두 초기화되었습니다.");
}

function renderBackupInfo() {
  if (!lastBackup) {
    $("backupText").textContent = "백업 정보 없음";
    return;
  }
  $("backupText").textContent = `최근 백업: ${formatDateTime(lastBackup.exportedAt)} / ${lastBackup.version}`;
}

function exportCurrentPeriodCsv() {
  const key = getPeriodKey();
  const lines = [];
  lines.push(["구분", "날짜", "항목", "내용"].join(","));
  collectPeriodItems(key).forEach(({ group, item }) => {
    lines.push([csv(group), csv(item.date || ""), csv(item.category || item.type || item.process || ""), csv(summaryText(item))].join(","));
  });
  downloadTextFile(`cctv-period-${key}.csv`, "\uFEFF" + lines.join("\n"), "text/csv");
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function collectPeriodItems(key) {
  return [
    ...realtimeRecords.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "실시간 개인실적", item })),
    ...civilRecords.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "민원처리", item })),
    ...policeRecords.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "경찰관제요청", item })),
    ...videoRecords.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "영상열람반출", item })),
    ...infoRecords.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "정보공개", item })),
    ...personalSpecials.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "개인특이사항", item })),
    ...teamSpecials.filter((r) => r.date.startsWith(key)).map((item) => ({ group: "조특이사항", item })),
  ];
}

function summaryText(item) {
  return [item.time, item.startTime && item.endTime ? `${item.startTime}~${item.endTime}` : "", item.manageNo, item.location, item.agency, item.complainantInfo, item.content, item.action, item.note].filter(Boolean).join(" · ");
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}


function labelHtml(value, mode = "default") {
  const label = String(value ?? "");

  if (mode === "civil") {
    const civilMap = {
      "비상벨대응": "비상벨<br>대응",
      "비상벨기타": "비상벨<br>기타",
      "비상벨계도": "비상벨<br>계도",
      "민원-나": "민원<br>(나)",
      "민원-대리": "민원<br>(대리)",
      "정보공개": "정보<br>공개",
    };

    return civilMap[label] || escapeHtml(label);
  }

  return escapeHtml(label);
}

function renderMatrixTable(tableId, categories, rows, options = {}) {
  const showTotal = options.showTotal !== false;
  const hideLabelColumn = options.hideLabelColumn === true;
  const labelMode = options.labelMode || "default";
  const cellListKey = options.cellListKey || "";
  const headers = showTotal ? ["구분", ...categories, "합계"] : ["구분", ...categories];
  const visibleHeaders = hideLabelColumn ? headers.slice(1) : headers;
  const table = $(tableId);

  function getCategoryByVisibleIndex(idx, length) {
    const isTotal = showTotal && idx === length - 1;
    if (isTotal) return "";
    return hideLabelColumn ? categories[idx] : categories[idx - 1];
  }

  function cellAttrs(idx, length) {
    if (!cellListKey) return "";
    const category = getCategoryByVisibleIndex(idx, length) || "";
    return `data-list-key="${escapeHtml(cellListKey)}" data-category="${escapeHtml(category)}"`;
  }

  table.innerHTML = `
    <thead>
      <tr>${visibleHeaders.map((header, idx) => {
        const isTotal = showTotal && idx === visibleHeaders.length - 1;
        return `<th ${cellAttrs(idx, visibleHeaders.length)} class="${idx === 0 && !hideLabelColumn ? "" : "num"} ${isTotal ? "totalCol" : ""}">${labelHtml(header, labelMode)}</th>`;
      }).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => {
        const visibleRow = hideLabelColumn ? row.slice(1) : row;
        return `
          <tr class="${row[0] === "월누계" || row[0] === "누계" ? "total" : ""}">
            ${visibleRow.map((cell, idx) => {
              const isTotal = showTotal && idx === visibleRow.length - 1;
              return `<td ${cellAttrs(idx, visibleRow.length)} class="${idx === 0 && !hideLabelColumn ? "matrixRowHead" : "num"} ${isTotal ? "totalCol" : ""}">${cellHtml(cell)}</td>`;
            }).join("")}
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
}

function renderTable(tableId, headers, rows, numericIndexes = []) {
  const table = $(tableId);
  if (!rows.length) {
    table.innerHTML = `
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody><tr><td class="emptyCell" colspan="${headers.length}">기록 없음</td></tr></tbody>
    `;
    return;
  }
  table.innerHTML = `
    <thead>
      <tr>${headers.map((h, idx) => `<th class="${numericIndexes.includes(idx) ? "num" : ""}">${escapeHtml(h)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr class="${String(row[0]).includes("합계") ? "total" : ""}">
          ${row.map((cell, idx) => `<td class="${numericIndexes.includes(idx) ? "num" : ""}">${cellHtml(cell)}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;
}

function cellHtml(value) {
  if (value && typeof value === "object" && "html" in value) return value.html;
  return escapeHtml(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
