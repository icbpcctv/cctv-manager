const APP_VERSION = "0.8.6-mobile-fixes";
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

const TEAM_ACCESS_KEY = "cctv_team_access_v1";
const DEFAULT_TEAM_CODES = {
  "1조": "1TEAM-2026",
  "2조": "2TEAM-2026",
  "3조": "3TEAM-2026",
  "4조": "4TEAM-2026",
};

let teamAccess = readJson(TEAM_ACCESS_KEY, {});
let pendingAccessTeam = "";


const CLOUD_ENABLED = true;
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDWaXefPNcRR6EIpv0KpjdERDcm1IDsPds",
  authDomain: "cctv-manager-icbp.firebaseapp.com",
  projectId: "cctv-manager-icbp",
  storageBucket: "cctv-manager-icbp.firebasestorage.app",
  messagingSenderId: "227716843687",
  appId: "1:227716843687:web:d5b93f75c2d64e3b0cf382",
  measurementId: "G-M2BL3W0YVK"
};

let cloudDb = null;
let cloudReady = false;
let cloudLoading = false;
let cloudSaving = false;
let cloudLastLoadedTeam = "";
let cloudStatusText = "클라우드 연결 준비 중";
let cloudSaveTimer = null;


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
  areaBaseMonth: "2026-05",
  areaBaseArea: "A",
  areaPattern: ["A", "C", "D", "B"],
};

const incidentCategoryGroups = {
  "강력": ["강도", "폭력", "절도", "성추행", "기타"],
  "경범죄": ["주거침입", "쓰레기투기", "음주소란", "기타"],
  "청소년비위": ["청소년선도", "비행"],
  "재난/화재": ["재난", "화재", "방화"],
  "교통사고등안전대응": ["교통사고", "도주차량", "기타"],
  "기타대응": ["실종", "사건사고방지"],
};

const realtimeCategories = Object.keys(incidentCategoryGroups);
const civilTypes = ["비상벨대응", "비상벨기타", "비상벨계도", "민원-나", "민원-대리", "정보공개"];
const policeCategories = Object.keys(incidentCategoryGroups);
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
  bindReports();
  bindMonthSearch();
  bindBackup();
  bindSettings();
  bindTeamAccess();
  applyTheme();
  saveLocalAll();
  renderAll();

  if (hasTeamAccess(getCloudTeamId())) {
    initCloudSync();
  } else {
    showTeamCodeModal(getCloudTeamId());
    setCloudStatus("공유코드 입력 필요");
  }
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

function saveLocalAll() {
  saveJson(SETTINGS_KEY, settings);
  saveJson(REALTIME_KEY, realtimeRecords);
  saveJson(CIVIL_KEY, civilRecords);
  saveJson(POLICE_KEY, policeRecords);
  saveJson(VIDEO_KEY, videoRecords);
  saveJson(INFO_KEY, infoRecords);
  saveJson(PERSONAL_SPECIAL_KEY, personalSpecials);
  saveJson(TEAM_SPECIAL_KEY, teamSpecials);
}

function saveAll() {
  saveLocalAll();
  scheduleCloudSave();
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

  if (!Array.isArray(next.areaPattern) || !next.areaPattern.length) {
    next.areaPattern = [...DEFAULT_SETTINGS.areaPattern];
  }

  if (!next.areaBaseMonth) next.areaBaseMonth = DEFAULT_SETTINGS.areaBaseMonth;
  if (!next.areaBaseArea) next.areaBaseArea = DEFAULT_SETTINGS.areaBaseArea;

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

function getWorkDateFromDateTime(dateValue, timeValue = "") {
  if (!dateValue) return "";

  const base = parseDateOnly(dateValue);
  const hour = Number(String(timeValue || "").slice(0, 2));
  const previous = new Date(base);
  previous.setDate(base.getDate() - 1);

  if (!Number.isNaN(hour) && hour < 9 && getShift(previous) === "야간") {
    return dateString(previous);
  }

  return dateString(base);
}

function getRecordPrimaryTime(record = {}) {
  return record.startTime || record.time || record.desiredTime || "";
}

function getRecordWorkDate(record = {}) {
  return getWorkDateFromDateTime(record.date, getRecordPrimaryTime(record));
}

function isRecordOnWorkDate(record, date) {
  return getRecordWorkDate(record) === date;
}

function isRecordInPeriod(record, period) {
  const workDate = getRecordWorkDate(record);
  return Boolean(workDate && workDate.startsWith(period));
}

function isRecordInPeriodToDate(record, period, endDate) {
  const workDate = getRecordWorkDate(record);
  return Boolean(workDate && workDate.startsWith(period) && workDate <= endDate);
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


function getWorkArea(date = new Date()) {
  const pattern = settings.areaPattern?.length ? settings.areaPattern : DEFAULT_SETTINGS.areaPattern;
  const baseMonth = settings.areaBaseMonth || DEFAULT_SETTINGS.areaBaseMonth;
  const baseArea = settings.areaBaseArea || DEFAULT_SETTINGS.areaBaseArea;

  const [baseYear, baseMonthNo] = baseMonth.split("-").map(Number);
  const baseIndex = Math.max(0, pattern.indexOf(baseArea));
  const targetMonthIndex = date.getFullYear() * 12 + date.getMonth();
  const baseMonthIndex = baseYear * 12 + (baseMonthNo - 1);
  const diff = targetMonthIndex - baseMonthIndex;
  const index = ((baseIndex + diff) % pattern.length + pattern.length) % pattern.length;

  return pattern[index] || baseArea || "A";
}

function getWorkAreaLabel(date = new Date()) {
  const area = getWorkArea(date);
  return area ? `${area}구역` : "";
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

      if (page === "managePage") {
        closeManageDetails();
      }

      if (page === "monthPage" && $("dailyReportDate")) {
        $("dailyReportDate").value = todayString();
      }

      renderAll();

      if (page !== "managePage") {
        closeManageDetails();
      }

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

function closeManageDetails() {
  document.querySelectorAll("#managePage details.settingDetails").forEach((details) => {
    details.open = false;
  });
}

function bindDynamicForms() {
  $("rtAgency").addEventListener("change", updateRealtimeAgencyFields);
  $("rtCategory").addEventListener("change", () => updateIncidentDetailOptions("rtCategory", "rtDetailCategory"));
  $("policeCategory").addEventListener("change", () => updateIncidentDetailOptions("policeCategory", "policeDetailCategory"));
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
  if ($("dailyReportDate")) $("dailyReportDate").value = todayString();
  if ($("monthlyReportMonth")) $("monthlyReportMonth").value = ymString(currentPeriodDate);

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


function bindReports() {
  const dailyBtn = $("previewDailyReportBtn");
  const monthlyBtn = $("previewMonthlyReportBtn");
  const closeBtn = $("closeReportModal");
  const printBtn = $("printReportBtn");

  if (dailyBtn) {
    dailyBtn.addEventListener("click", () => {
      const date = $("dailyReportDate").value || todayString();
      openReportPreview("daily", date);
    });
  }

  if (monthlyBtn) {
    monthlyBtn.addEventListener("click", () => {
      const month = $("monthlyReportMonth")?.value || getPeriodKey();
      openReportPreview("monthly", month);
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeReportPreview);
  if (printBtn) printBtn.addEventListener("click", printReportPreview);
}

function bindMonthSearch() {
  const input = $("monthSearchInput");
  const btn = $("monthSearchBtn");
  const scope = $("monthSearchScope");

  if (!input || !btn || !scope) return;

  btn.addEventListener("click", renderMonthSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderMonthSearch();
  });
  scope.addEventListener("change", renderMonthSearch);
}

function bindBackup() {
  $("backupExportBtn").addEventListener("click", exportBackup);
  $("backupImportInput").addEventListener("change", importBackup);
  $("resetDataBtn").addEventListener("click", resetAllRecords);
  if ($("cloudReloadBtn")) {
    $("cloudReloadBtn").addEventListener("click", () => loadCloudData({ preferCloud: true }));
  }
}

function bindSettings() {
  $("saveShiftSettingBtn").addEventListener("click", saveShiftSettings);
  $("resetShiftSettingBtn").addEventListener("click", resetShiftSettings);
  $("saveAreaSettingBtn").addEventListener("click", saveAreaSettings);
  $("resetAreaSettingBtn").addEventListener("click", resetAreaSettings);
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

    if (!hasTeamAccess(team)) {
      showTeamCodeModal(team);
      setCloudStatus("공유코드 입력 필요");
    }
  });
}


function updateInputSuggestions() {
  const locationValues = uniqueCompact([
    ...realtimeRecords.map((r) => r.location),
    ...civilRecords.map((r) => r.location),
    ...policeRecords.map((r) => r.location),
  ], 30);

  const agencyValues = uniqueCompact([
    "부평상황실",
    "삼산상황실",
    "역전지구대(부평)",
    "동암지구대(부평)",
    "철마지구대(부평)",
    "부평2파출소(부평)",
    "청천지구대(부평)",
    "갈산지구대(삼산)",
    "부흥지구대(삼산)",
    "중앙지구대(삼산)",
    "부개파출소(삼산)",
    "부개2파출소(삼산)",
    "112",
    "119",
    ...realtimeRecords.map((r) => r.agency),
    ...policeRecords.map((r) => r.agency),
    ...videoRecords.map((r) => r.approval?.org),
    ...videoRecords.map((r) => r.destroy?.org),
  ], 30);

  fillDatalist("locationSuggestions", locationValues);
  fillDatalist("agencySuggestions", agencyValues);
}

function uniqueCompact(values, limit = 30) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, limit);
}

function fillDatalist(id, values) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function finishInputSave(type) {
  const keepGoing = $("continueInputAfterSave")?.checked;

  saveAll();
  renderAll();

  if (keepGoing) {
    openInputModal(type);
    if ($("continueInputAfterSave")) $("continueInputAfterSave").checked = true;
    return;
  }

  closeInputModal();
}

function renderAll() {
  applyTheme();
  renderHeader();
  renderHomeSummary();
  renderHomeDetails();
  renderMonthPage();
  renderBackupInfo();
  renderSettings();
  updateInputSuggestions();
  renderCloudStatus();
}

function renderHeader() {
  const workDate = getWorkDate(new Date());
  const shift = getShift(workDate);
  const members = settings.teams?.[settings.activeTeam] || settings.members || [];
  const user = settings.currentUser || members[0] || "사용자 미선택";

  $("headerDateText").textContent = formatHeaderDate();
  $("headerShiftBadge").textContent = shift;
  $("headerTeamName").textContent = settings.activeTeam || settings.teamName || "1조";
  const areaLabel = getWorkAreaLabel(workDate);
  $("headerUserName").textContent = areaLabel ? `${user}(${areaLabel})` : user;
  $("versionText").textContent = `현재버전 ${APP_VERSION}`;

  setShiftClass(shift);
}

function renderSettings() {
  $("settingBaseDate").value = settings.baseDate;
  $("settingBaseShift").value = settings.baseShift;
  $("settingShiftPattern").value = settings.shiftPattern.join(",");
  $("settingAreaBaseMonth").value = settings.areaBaseMonth || "2026-05";
  $("settingAreaBaseArea").value = settings.areaBaseArea || "A";
  $("settingAreaPattern").value = (settings.areaPattern || ["A", "C", "D", "B"]).join(",");

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
  if ($("monthlyReportMonth")) $("monthlyReportMonth").value = ymString(currentPeriodDate);
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
  const todayRecords = realtimeRecords.filter((r) => isRecordOnWorkDate(r, today));
  const monthRecords = realtimeRecords.filter((r) => isRecordInPeriod(r, ym));
  const todayValues = realtimeCategories.map((c) => countIncidentByMajor(todayRecords, c));
  const monthValues = realtimeCategories.map((c) => countIncidentByMajor(monthRecords, c));
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
  const todayRecords = policeRecords.filter((r) => isRecordOnWorkDate(r, today));
  const monthRecords = policeRecords.filter((r) => isRecordInPeriod(r, ym));
  const todayValues = policeCategories.map((c) => countIncidentByMajor(todayRecords, c));
  const monthValues = policeCategories.map((c) => countIncidentByMajor(monthRecords, c));
  renderMatrixTable(tableId, policeCategories, [["오늘", ...todayValues, sum(todayValues)]], { hideLabelColumn: true, cellListKey: "homePolice" });
  setMonthHint("policeMonthHint", `이번달 누계 <strong>${sum(monthValues)}</strong>건`);
}

function renderVideoSummary(tableId, today, ym) {
  const todayValues = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => isRecordOnWorkDate(r, today) && r.category === c)));
  const monthValues = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => isRecordInPeriod(r, ym) && r.category === c)));
  renderMatrixTable(tableId, videoCategories, [
    ["오늘", ...todayValues, formatVideoCount(videoRecords.filter((r) => isRecordOnWorkDate(r, today)))],
  ], { hideLabelColumn: true, cellListKey: "homeVideo" });
  setMonthHint("videoMonthHint", `이번달 누계 <strong>${formatVideoCountInline(videoRecords.filter((r) => isRecordInPeriod(r, ym)))}건</strong>`);
}

function renderInfoSummary(tableId, today, ym) {
  const todayCount = infoRecords.filter((r) => isRecordOnWorkDate(r, today)).length;
  const monthCount = infoRecords.filter((r) => isRecordInPeriod(r, ym)).length;
  renderTable(tableId, ["오늘"], [[todayCount]], [0]);
  setMonthHint("infoMonthHint", `이번달 누계 <strong>${monthCount}</strong>건`);
}

function setMonthHint(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function countCivilByLabel(date, label) {
  if (label === "정보공개") {
    return infoRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
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
    return infoRecords.filter((r) => isRecordInPeriod(r, ym)).length;
  }

  return civilRecords.filter((r) => {
    if (!isRecordInPeriod(r, ym)) return false;
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

  renderTable("realtimeTodayTable", ["번호", "신고/출동/종료", "기관", "관리번호", "위치", "구분", "세부", "내용", "조치사항"],
    realtimeRecords.filter((r) => isRecordOnWorkDate(r, today)).map((r, idx) => [idx + 1, `${r.startTime || "-"} / ${r.dispatchTime || "-"} / ${r.endTime || "-"}`, r.agency || "", r.manageNo, r.location, normalizeIncidentCategory(r.category), getIncidentDetail(r), r.content, r.note]), [0]);

  renderTable("policeTodayTable", ["번호", "시간", "구분", "세부", "요청기관", "관리번호", "주소/위치", "내용", "조치사항"],
    policeRecords.filter((r) => isRecordOnWorkDate(r, today)).map((r, idx) => [idx + 1, r.time, normalizeIncidentCategory(r.category), getIncidentDetail(r), r.agency, r.manageNo, r.location, r.content, r.action]), [0]);

  renderTable("civilTodayTable", ["번호", "시간", "민원종류", "민원인정보", "연락처", "관리번호", "위치", "민원내용", "조치사항"],
    civilRecords.filter((r) => isRecordOnWorkDate(r, today)).map((r, idx) => [idx + 1, r.time, civilTitle(r), r.complainantInfo, r.complainantPhone, r.manageNo, r.location, r.content, r.action]), [0]);

  renderTable("infoTodayTable", ["번호", "접수일", "청구일", "열람희망", "결과", "접수번호", "관리번호", "청구인", "연락처", "청구내용", "비고"],
    infoRecords.filter((r) => isRecordOnWorkDate(r, today)).map((r, idx) => [idx + 1, r.date, r.claimDate, formatInfoDesired(r), r.result, r.receiptNo, r.manageNo, r.claimantName, r.claimantPhone, r.content, r.note]), [0]);

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
  if ($("monthSearchInput") && $("monthSearchInput").value.trim()) renderMonthSearch();
}

function getPeriodKey() {
  return $("periodMode").value === "month" ? ymString(currentPeriodDate) : yearString(currentPeriodDate);
}

function renderMonthlyDaily(key) {
  const realtime = realtimeRecords.filter((r) => isRecordInPeriod(r, key)).length;
  const civil = civilRecords.filter((r) => isRecordInPeriod(r, key)).length;
  const police = policeRecords.filter((r) => isRecordInPeriod(r, key)).length;
  const video = videoRecords.filter((r) => isRecordInPeriod(r, key)).length;
  const info = infoRecords.filter((r) => isRecordInPeriod(r, key)).length;

  renderMatrixTable(
    "monthDailyTable",
    ["개인실적", "민원처리", "경찰관제", "열람복제", "정보공개"],
    [["누계", realtime, civil, police, video, info]],
    { showTotal: false, hideLabelColumn: true, cellListKey: "monthDaily" },
  );
}

function renderMonthlyPolice(key) {
  const values = policeCategories.map((c) => policeRecords.filter((r) => isRecordInPeriod(r, key) && r.category === c).length);
  renderMatrixTable("monthPoliceTable", policeCategories, [["누계", ...values, sum(values)]], { hideLabelColumn: true, cellListKey: "monthPolice" });
}

function renderMonthlyVideo(key) {
  const values = videoCategories.map((c) => formatVideoCount(videoRecords.filter((r) => isRecordInPeriod(r, key) && r.category === c)));
  renderMatrixTable("monthVideoTable", videoCategories, [["누계", ...values, formatVideoCount(videoRecords.filter((r) => isRecordInPeriod(r, key)))]] , { hideLabelColumn: true, cellListKey: "monthVideo" }); 
}

function renderMonthlyCivil(key) {
  const values = civilTypes.map((label) => countCivilByPeriodLabel(key, label));
  renderMatrixTable("monthCivilTable", civilTypes, [["누계", ...values]], { showTotal: false, hideLabelColumn: true, labelMode: "civil", cellListKey: "monthCivil" });
}

function renderMonthlyInfo(key) {
  const count = infoRecords.filter((r) => isRecordInPeriod(r, key)).length;
  renderTable("monthInfoTable", ["누계"], [[count]], [0]);
}

function renderMonthlyRealtime(key) {
  const values = realtimeCategories.map((c) => realtimeRecords.filter((r) => isRecordInPeriod(r, key) && r.category === c).length);
  renderMatrixTable("monthRealtimeTable", realtimeCategories, [["누계", ...values, sum(values)]], { hideLabelColumn: true, cellListKey: "monthRealtime" });
}

function countCivilByPeriodLabel(key, label) {
  if (label === "정보공개") {
    return infoRecords.filter((r) => isRecordInPeriod(r, key)).length;
  }

  return civilRecords.filter((r) => {
    if (!isRecordInPeriod(r, key)) return false;
    if (label === "민원-나") return r.type === "전화민원" && r.phoneOwner === "나";
    if (label === "민원-대리") return r.type === "전화민원" && r.phoneOwner === "대리";
    return r.type === label;
  }).length;
}

function renderMonthlySpecials(key) {
  renderTable("monthPersonalSpecialTable", ["번호", "날짜", "구분", "관리번호", "위치", "내용", "비고"],
    personalSpecials.filter((r) => isRecordInPeriod(r, key)).map((r, idx) => [idx + 1, r.date, r.category, r.manageNo, r.location, r.content, r.note]), [0]);
  renderTable("monthTeamSpecialTable", ["번호", "날짜", "시간", "제목", "요청기관", "관리번호", "관제요원", "사건개요", "처리결과"],
    teamSpecials.filter((r) => isRecordInPeriod(r, key)).map((r, idx) => [idx + 1, r.date, r.time, r.specialTitle || r.category, r.agency, r.manageNo, r.operators || r.user, r.content, r.action]), [0]);
}

function renderMonthlyDocs(key) {
  renderTable("monthApprovalTable", ["번호", "상태", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "키워드", "내용"],
    videoRecords.filter((r) => isRecordInPeriod(r, key) && r.approval).map((r, idx) => [
      idx + 1, r.approval.completed ? "접수완료" : "대기", formatDateTime(r.approval.visitDateTime), r.approval.org,
      r.approval.rank, r.approval.name, r.approval.phone, r.approval.docNo, r.approval.keyword, r.approval.content,
    ]), [0]);

  renderTable("monthDestroyTable", ["번호", "상태", "방문일시", "소속기관", "직급", "이름", "연락처", "공문번호", "발신공문번호", "내용"],
    videoRecords.filter((r) => isRecordInPeriod(r, key) && r.destroy).map((r, idx) => [
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
    homeRealtime: { title: "오늘 실시간 개인실적", refs: realtimeRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("realtime", item)) },
    homePolice: { title: "오늘 경찰관제요청", refs: policeRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("police", item)) },
    homeVideo: { title: "오늘 영상열람반출", refs: videoRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("video", item)) },
    homeCivil: { title: "오늘 민원처리", refs: [...civilRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("civil", item)), ...infoRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("info", item))] },
    homeInfo: { title: "오늘 정보공개", refs: infoRecords.filter((r) => isRecordOnWorkDate(r, today)).map((item) => ref("info", item)) },
    homeApproval: { title: "사후결재", refs: videoRecords.filter((r) => r.approval && !r.approval.completed).map((item) => ref("video", item, "사후결재")) },
    homeDestroy: { title: "파기공문", refs: videoRecords.filter((r) => r.destroy && !r.destroy.completed).map((item) => ref("video", item, "파기공문")) },
    monthRealtime: { title: "실시간 개인실적", refs: realtimeRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("realtime", item)) },
    monthPolice: { title: "경찰관제요청", refs: policeRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("police", item)) },
    monthVideo: { title: "영상열람반출", refs: videoRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("video", item)) },
    monthCivil: { title: "민원처리", refs: [...civilRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("civil", item)), ...infoRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("info", item))] },
    monthPersonalSpecial: { title: "개인특이사항", refs: personalSpecials.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("realtime", item, "개인특이")) },
    monthTeamSpecial: { title: "조특이사항", refs: teamSpecials.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("police", item, "조특이")) },
    monthApproval: { title: "사후결재", refs: videoRecords.filter((r) => isRecordInPeriod(r, period) && r.approval).map((item) => ref("video", item, "사후결재")) },
    monthDestroy: { title: "파기공문", refs: videoRecords.filter((r) => isRecordInPeriod(r, period) && r.destroy).map((item) => ref("video", item, "파기공문")) },
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

function getPeriodDateList(period, fallbackDates) {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return Array.from({ length: lastDay }, (_, idx) => `${year}-${String(month).padStart(2, "0")}-${String(idx + 1).padStart(2, "0")}`).reverse();
  }

  return Array.from(fallbackDates).sort().reverse();
}

function getDailyPayload(period, category = "") {
  if (category) {
    const refsByCategory = {
      "개인실적": realtimeRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("realtime", item)),
      "민원처리": civilRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("civil", item)),
      "민원": civilRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("civil", item)),
      "경찰관제": policeRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("police", item)),
      "열람복제": videoRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("video", item)),
      "정보공개": infoRecords.filter((r) => isRecordInPeriod(r, period)).map((item) => ref("info", item)),
    };
    return { title: `일자별 현황 · ${category}`, html: renderRecordList(refsByCategory[category] || []) };
  }

  const dates = new Set();

  [...realtimeRecords, ...civilRecords, ...policeRecords, ...videoRecords, ...infoRecords].forEach((r) => {
    const workDate = getRecordWorkDate(r);
    if (workDate && workDate.startsWith(period)) dates.add(workDate);
  });

  const html = `
    <div class="dateSummaryTableWrap">
      <table class="dateSummaryListTable">
        <thead>
          <tr><th>날짜</th><th>개인</th><th>민원</th><th>경찰</th><th>영상</th><th>정보</th></tr>
        </thead>
        <tbody>
          ${getPeriodDateList(period, dates).map((date) => {
            const rt = realtimeRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
            const cv = civilRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
            const po = policeRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
            const vi = videoRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
            const inf = infoRecords.filter((r) => isRecordOnWorkDate(r, date)).length;
            const hasRecord = rt + cv + po + vi + inf > 0;

            return `<tr class="${hasRecord ? "hasRecord" : ""}" data-date-detail="${escapeHtml(date)}"><td>${escapeHtml(date)}</td><td>${rt}</td><td>${cv}</td><td>${po}</td><td>${vi}</td><td>${inf}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  return { title: "일자별 현황", html };
}

function getDateDetailPayload(date) {
  const refs = [
    ...realtimeRecords.filter((r) => isRecordOnWorkDate(r, date)).map((item) => ref("realtime", item)),
    ...civilRecords.filter((r) => isRecordOnWorkDate(r, date)).map((item) => ref("civil", item)),
    ...policeRecords.filter((r) => isRecordOnWorkDate(r, date)).map((item) => ref("police", item)),
    ...videoRecords.filter((r) => isRecordOnWorkDate(r, date)).map((item) => ref("video", item)),
    ...infoRecords.filter((r) => isRecordOnWorkDate(r, date)).map((item) => ref("info", item)),
  ];
  return { title: `${date} 세부내용`, html: renderRecordList(refs) };
}

function ref(type, item, prefix = "") { return { type, item, prefix }; }

function renderRecordList(refs) {
  if (!refs.length) return '<div class="emptyList">기록 없음</div>';

  const sortedRefs = [...refs].sort((a, b) => {
    const ad = `${a.item.date || ""} ${a.item.time || a.item.startTime || ""}`;
    const bd = `${b.item.date || ""} ${b.item.time || b.item.startTime || ""}`;
    return bd.localeCompare(ad);
  });

  return sortedRefs.map(({ type, item, prefix }, idx) => `<button class="recordListItem" type="button" data-edit-type="${type}" data-edit-id="${escapeHtml(item.sourceId || item.id)}"><span class="recordNo">${idx + 1}</span><span class="recordText"><strong>${escapeHtml(recordTitle(type, item, prefix))}</strong><small>${escapeHtml(recordSubText(type, item))}</small></span></button>`).join("");
}

function recordTitle(type, item, prefix = "") {
  const label = prefix ? `${prefix} · ` : "";
  if (type === "realtime") return `${label}${item.date || ""} ${item.startTime || ""} ${normalizeIncidentCategory(item.category)} ${getIncidentDetail(item)}`;
  if (type === "civil") return `${label}${item.date || ""} ${item.time || ""} ${civilTitle(item)}`;
  if (type === "police") return `${label}${item.date || ""} ${item.time || ""} ${normalizeIncidentCategory(item.category)} ${getIncidentDetail(item)}`;
  if (type === "video") return `${label}${item.date || ""} ${item.time || ""} ${item.process || ""} · ${item.category || ""}`;
  if (type === "info") return `${label}${item.date || ""} 정보공개 ${item.receiptNo || ""}`;
  return `${label}${item.date || ""}`;
}

function recordSubText(type, item) {
  if (type === "realtime") return [item.agency, item.manageNo, item.location, item.content, item.note].filter(Boolean).join(" · ");
  if (type === "civil") return [item.complainantInfo, item.complainantPhone, item.manageNo, item.location, item.content, item.action].filter(Boolean).join(" · ");
  if (type === "police") return [item.specialTitle, item.agency, item.manageNo, item.location, item.content, item.action].filter(Boolean).join(" · ");
  if (type === "video") return [item.content, item.approval ? "사후결재" : "", item.destroy ? "파기공문" : ""].filter(Boolean).join(" · ");
  if (type === "info") return [item.result, item.claimDate, formatInfoDesired(item), item.manageNo, item.claimantName, item.content, item.note].filter(Boolean).join(" · ");
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
    $("rtDispatchTime").value = record?.dispatchTime || "";
    $("rtEndTime").value = record?.endTime || "";
    setRealtimeAgencyValue(record?.agency || "부평상황실");
    $("rtManageNo").value = record?.manageNo || "";
    $("rtLocation").value = record?.location || "";
    $("rtCategory").value = normalizeIncidentCategory(record?.category || "강력");
    updateIncidentDetailOptions("rtCategory", "rtDetailCategory", record?.detailCategory || getIncidentDetail(record || { category: "강력" }));
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
    $("civilComplainantPhone").value = record?.complainantPhone || "";
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
    $("policeCategory").value = normalizeIncidentCategory(record?.category || "강력");
    updateIncidentDetailOptions("policeCategory", "policeDetailCategory", record?.detailCategory || getIncidentDetail(record || { category: "강력" }));
    setPoliceAgencyValue(record?.agency || "부평상황실");
    $("policeManageNo").value = record?.manageNo || "";
    $("policeLocation").value = record?.location || "";
    $("policeSpecialTitle").value = record?.specialTitle || "";
    $("policeOperators").value = record?.operators || getDefaultOperators();
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
    $("infoClaimDate").value = record?.claimDate || "";
    $("infoDesiredDate").value = record?.desiredDate || "";
    $("infoDesiredTime").value = record?.desiredTime || "";
    $("infoResult").value = record?.result || "공개";
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

function setRealtimeAgencyValue(value) {
  const select = $("rtAgency");
  const direct = $("rtAgencyDirect");

  if (!select || !direct) return;

  const optionValues = Array.from(select.options).map((option) => option.value || option.textContent);

  if (optionValues.includes(value)) {
    select.value = value;
    direct.value = "";
  } else {
    select.value = "직접입력";
    direct.value = value || "";
  }

  updateRealtimeAgencyFields();
}

function updateRealtimeAgencyFields() {
  const select = $("rtAgency");
  const directGroup = $("rtAgencyDirectGroup");

  if (!select || !directGroup) return;

  directGroup.classList.toggle("hidden", select.value !== "직접입력");
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
    dispatchTime: $("rtDispatchTime").value,
    endTime: $("rtEndTime").value,
    agency: $("rtAgency").value === "직접입력" ? $("rtAgencyDirect").value.trim() : $("rtAgency").value,
    manageNo: $("rtManageNo").value.trim(),
    location: $("rtLocation").value.trim(),
    category: $("rtCategory").value,
    detailCategory: $("rtDetailCategory").value,
    content: $("rtContent").value.trim(),
    note: $("rtNote").value.trim(),
    createdAt: new Date().toISOString(),
    team: settings.activeTeam || "1조",
    user: getUserName(),
  };
  const saved = saveRecordToList("realtime", realtimeRecords, record);
  if ($("rtPersonalSpecial").checked) personalSpecials.push({ ...saved, id: makeId(), sourceId: saved.id });
  finishInputSave("realtime");
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
    complainantPhone: $("civilComplainantPhone").value.trim(),
    manageNo: $("civilManageNo").value.trim(),
    location: $("civilLocation").value.trim(),
    content: $("civilContent").value.trim(),
    action: $("civilAction").value.trim(),
    createdAt: new Date().toISOString(),
    team: settings.activeTeam || "1조",
    user: getUserName(),
  };

  saveRecordToList("civil", civilRecords, record);
  finishInputSave("civil");
}

function savePoliceRecord(e) {
  e.preventDefault();
  const record = {
    id: makeId(),
    date: $("policeDate").value || todayString(),
    time: $("policeTime").value || timeString(),
    category: $("policeCategory").value,
    detailCategory: $("policeDetailCategory").value,
    agency: $("policeAgency").value === "직접입력" ? $("policeAgencyDirect").value.trim() : $("policeAgency").value,
    manageNo: $("policeManageNo").value.trim(),
    location: $("policeLocation").value.trim(),
    specialTitle: $("policeSpecialTitle").value.trim(),
    operators: $("policeOperators").value.trim(),
    content: $("policeContent").value.trim(),
    action: $("policeAction").value.trim(),
    createdAt: new Date().toISOString(),
    team: settings.activeTeam || "1조",
    user: getUserName(),
  };
  const saved = saveRecordToList("police", policeRecords, record);
  if ($("policeTeamSpecial").checked) teamSpecials.push({ ...saved, id: makeId(), sourceId: saved.id });
  finishInputSave("police");
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
    team: settings.activeTeam || "1조",
    user: getUserName(),
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
  finishInputSave("video");
}

function saveInfoRecord(e) {
  e.preventDefault();
  const record = {
    id: editState?.type === "info" ? editState.id : makeId(),
    date: $("infoReceiptDate").value || todayString(),
    claimDate: $("infoClaimDate").value,
    desiredDate: $("infoDesiredDate").value,
    desiredTime: $("infoDesiredTime").value,
    result: $("infoResult").value,
    receiptNo: $("infoReceiptNo").value.trim(),
    manageNo: $("infoManageNo").value.trim(),
    claimantName: $("infoClaimantName").value.trim(),
    claimantPhone: $("infoClaimantPhone").value.trim(),
    content: $("infoContent").value.trim(),
    note: $("infoNote").value.trim(),
    createdAt: new Date().toISOString(),
    team: settings.activeTeam || "1조",
    user: getUserName(),
  };

  saveRecordToList("info", infoRecords, record);
  finishInputSave("info");
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


function saveAreaSettings() {
  const baseMonth = $("settingAreaBaseMonth").value;
  const baseArea = $("settingAreaBaseArea").value;
  const pattern = parseListText($("settingAreaPattern").value).map((item) => item.toUpperCase());
  const allowed = ["A", "B", "C", "D"];
  const invalid = pattern.filter((item) => !allowed.includes(item));

  if (!baseMonth) return alert("기준 월을 선택해주세요.");
  if (!pattern.length) return alert("구역 순서를 입력해주세요.");
  if (invalid.length) return alert(`사용할 수 없는 구역이 있습니다: ${invalid.join(", ")}`);
  if (!pattern.includes(baseArea)) return alert("구역 순서 안에 기준 월 구역이 포함되어야 합니다.");

  settings.areaBaseMonth = baseMonth;
  settings.areaBaseArea = baseArea;
  settings.areaPattern = pattern;
  saveAll();
  renderAll();
  alert("근무구역 패턴이 저장되었습니다.");
}

function resetAreaSettings() {
  settings.areaBaseMonth = DEFAULT_SETTINGS.areaBaseMonth;
  settings.areaBaseArea = DEFAULT_SETTINGS.areaBaseArea;
  settings.areaPattern = [...DEFAULT_SETTINGS.areaPattern];
  saveAll();
  renderAll();
  alert("근무구역 패턴이 초기화되었습니다.");
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

  if (hasTeamAccess(settings.activeTeam)) {
    switchCloudTeamIfNeeded();
  } else {
    showTeamCodeModal(settings.activeTeam);
    setCloudStatus("공유코드 입력 필요");
  }

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



function normalizeTeamCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getTeamAccessCode(team) {
  return DEFAULT_TEAM_CODES[team] || "";
}

function hasTeamAccess(team = getCloudTeamId()) {
  return teamAccess[team] === true;
}

function saveTeamAccess() {
  saveJson(TEAM_ACCESS_KEY, teamAccess);
}

function bindTeamAccess() {
  if ($("teamCodeSubmitBtn")) {
    $("teamCodeSubmitBtn").addEventListener("click", submitTeamCode);
  }

  if ($("teamCodeInput")) {
    $("teamCodeInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitTeamCode();
    });
  }

  if ($("changeTeamCodeBtn")) {
    $("changeTeamCodeBtn").addEventListener("click", () => showTeamCodeModal(getCloudTeamId()));
  }

  if ($("clearTeamCodeBtn")) {
    $("clearTeamCodeBtn").addEventListener("click", () => {
      const team = getCloudTeamId();
      if (!confirm(`${team} 접속코드를 초기화할까요? 다시 접속하려면 공유코드를 입력해야 합니다.`)) return;
      delete teamAccess[team];
      saveTeamAccess();
      showTeamCodeModal(team);
      setCloudStatus("공유코드 입력 필요");
    });
  }

  if ($("teamCodeTeam")) {
    $("teamCodeTeam").addEventListener("change", () => {
      pendingAccessTeam = $("teamCodeTeam").value;
      $("teamCodeMessage").textContent = "";
    });
  }
}

function showTeamCodeModal(team = getCloudTeamId()) {
  pendingAccessTeam = team;
  if ($("teamCodeTeam")) $("teamCodeTeam").value = team;
  if ($("teamCodeInput")) $("teamCodeInput").value = "";
  if ($("teamCodeMessage")) $("teamCodeMessage").textContent = "";
  if ($("teamCodeModal")) $("teamCodeModal").classList.add("show");
}

function closeTeamCodeModal() {
  if ($("teamCodeModal")) $("teamCodeModal").classList.remove("show");
}

async function submitTeamCode() {
  const team = $("teamCodeTeam")?.value || pendingAccessTeam || getCloudTeamId();
  const input = normalizeTeamCode($("teamCodeInput")?.value);
  const correct = normalizeTeamCode(getTeamAccessCode(team));

  if (!input) {
    $("teamCodeMessage").textContent = "공유코드를 입력해주세요.";
    return;
  }

  if (input !== correct) {
    $("teamCodeMessage").textContent = "공유코드가 맞지 않습니다.";
    return;
  }

  teamAccess[team] = true;
  saveTeamAccess();

  settings.activeTeam = team;
  settings.teamName = team;
  settings.members = settings.teams[team] || [];
  if (!settings.currentUser || !settings.members.includes(settings.currentUser)) {
    settings.currentUser = settings.members[0] || "";
  }

  saveLocalAll();
  closeTeamCodeModal();
  renderAll();

  if (!cloudReady) {
    await initCloudSync();
  } else {
    await loadCloudData({ preferCloud: true });
  }
}


function applyCloudPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  settings = mergeSettings(payload.settings || settings);
  realtimeRecords = ensureIds(payload.realtimeRecords || []);
  civilRecords = ensureIds(payload.civilRecords || []);
  policeRecords = ensureIds(payload.policeRecords || []);
  videoRecords = ensureIds(payload.videoRecords || []);
  infoRecords = ensureIds(payload.infoRecords || []);
  personalSpecials = ensureIds(payload.personalSpecials || []);
  teamSpecials = ensureIds(payload.teamSpecials || []);

  saveLocalAll();
}

function getCloudTeamId() {
  return settings.activeTeam || settings.teamName || "1조";
}

function getCloudDocRef() {
  if (!cloudDb) return null;
  const teamId = getCloudTeamId();
  return cloudDb.collection("cctvManager").doc("v1").collection("teams").doc(teamId).collection("state").doc("main");
}

function setCloudStatus(text) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  cloudStatusText = `${text} · ${hh}:${mm}`;
  renderCloudStatus();
}

function getCloudStateClass() {
  if (cloudSaving || cloudLoading || /연결 중|저장 중|불러오는 중/.test(cloudStatusText)) return "saving";
  if (/실패|오프라인|로컬|공유코드/.test(cloudStatusText)) return "error";
  if (/완료|생성/.test(cloudStatusText)) return "ok";
  return "";
}

function renderCloudStatus() {
  const detail = $("cloudStatusText");
  if (detail) detail.textContent = cloudStatusText;

  const dot = $("cloudStatusDot");
  if (dot) {
    dot.className = `cloudStatusDot ${getCloudStateClass()}`;
    dot.title = cloudStatusText;
    dot.setAttribute("aria-label", cloudStatusText);
  }
}

async function initCloudSync() {
  if (!CLOUD_ENABLED) return;

  if (!hasTeamAccess(getCloudTeamId())) {
    showTeamCodeModal(getCloudTeamId());
    setCloudStatus("공유코드 입력 필요");
    return;
  }

  try {
    if (!window.firebase || !window.firebase.firestore) {
      setCloudStatus("클라우드 SDK 로딩 실패 · 로컬 저장 중");
      return;
    }

    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    cloudDb = firebase.firestore();
    cloudReady = true;
    setCloudStatus("클라우드 연결 중");

    await loadCloudData({ preferCloud: true });
  } catch (error) {
    console.error("Firebase init failed", error);
    cloudReady = false;
    setCloudStatus("클라우드 연결 실패 · 로컬 저장 중");
  }
}

async function loadCloudData({ preferCloud = true } = {}) {
  if (!hasTeamAccess(getCloudTeamId())) {
    showTeamCodeModal(getCloudTeamId());
    setCloudStatus("공유코드 입력 필요");
    return;
  }

  if (!cloudReady || !cloudDb) return;
  if (cloudLoading) return;

  cloudLoading = true;
  const teamId = getCloudTeamId();

  try {
    setCloudStatus(`${teamId} 클라우드 불러오는 중`);
    const ref = getCloudDocRef();
    const snap = await ref.get();

    if (snap.exists && preferCloud) {
      const data = snap.data();
      applyCloudPayload(data.payload || data);
      cloudLastLoadedTeam = teamId;
      setCloudStatus(`${teamId} 클라우드 동기화 완료`);
    } else {
      await saveCloudNow({ force: true });
      cloudLastLoadedTeam = teamId;
      setCloudStatus(`${teamId} 클라우드 새 데이터 생성 완료`);
    }

    renderAll();
  } catch (error) {
    console.error("Cloud load failed", error);
    setCloudStatus(`${teamId} 클라우드 불러오기 실패 · 로컬 저장 중`);
  } finally {
    cloudLoading = false;
    renderCloudStatus();
  }
}

function scheduleCloudSave() {
  if (!cloudReady || cloudLoading || cloudSaving) return;

  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudNow().catch((error) => {
      console.error("Cloud save failed", error);
      setCloudStatus("클라우드 저장 실패 · 로컬 저장 완료");
    });
  }, 650);
}

async function saveCloudNow({ force = false } = {}) {
  if (!hasTeamAccess(getCloudTeamId())) return;
  if (!cloudReady || !cloudDb) return;
  if (cloudLoading && !force) return;

  const teamId = getCloudTeamId();
  const payload = createBackupPayload();

  cloudSaving = true;
  try {
    setCloudStatus(`${teamId} 클라우드 저장 중`);
    await getCloudDocRef().set({
      payload,
      teamId,
      appVersion: APP_VERSION,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    cloudLastLoadedTeam = teamId;
    setCloudStatus(`${teamId} 클라우드 저장 완료`);
  } finally {
    cloudSaving = false;
    renderCloudStatus();
  }
}

async function switchCloudTeamIfNeeded() {
  if (!cloudReady) return;
  const teamId = getCloudTeamId();

  if (teamId === cloudLastLoadedTeam) {
    scheduleCloudSave();
    return;
  }

  await loadCloudData({ preferCloud: true });
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


function getUserName() {
  const members = settings.teams?.[settings.activeTeam] || settings.members || [];
  return settings.currentUser || members[0] || "사용자";
}

function getDefaultOperators() {
  const members = settings.teams?.[settings.activeTeam] || [];
  return members.length ? members.filter(Boolean).join(", ") : getUserName();
}

function formatInfoDesired(item) {
  return [item.desiredDate, item.desiredTime].filter(Boolean).join(" ");
}

function formatKoreanDate(dateStringValue) {
  if (!dateStringValue) return "-";
  const d = parseDateOnly(dateStringValue);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${days[d.getDay()]}`;
}

function formatReportDateTitle(dateStringValue) {
  if (!dateStringValue) return "-";
  const d = parseDateOnly(dateStringValue);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${days[d.getDay()]}. ${getShift(d)}`;
}

function getMonthlyKeyFromDate(dateStringValue) {
  return String(dateStringValue || "").slice(0, 7);
}

function countBy(list, predicate) {
  return list.filter(predicate).length;
}


function normalizeIncidentCategory(category) {
  const map = {
    "강력범죄": "강력",
    "강력": "강력",
    "경범": "경범죄",
    "경범죄": "경범죄",
    "청소년": "청소년비위",
    "청소년비위": "청소년비위",
    "재난": "재난/화재",
    "재난화재": "재난/화재",
    "재난/화재": "재난/화재",
    "교통": "교통사고등안전대응",
    "교통사고": "교통사고등안전대응",
    "교통안전대응": "교통사고등안전대응",
    "교통사고등안전대응": "교통사고등안전대응",
    "실종": "기타대응",
    "기타": "기타대응",
    "기타대응": "기타대응",
  };

  return map[category] || category || "기타대응";
}

function getIncidentDetail(item) {
  if (item?.detailCategory) return item.detailCategory;

  const category = normalizeIncidentCategory(item?.category);
  const details = incidentCategoryGroups[category] || [];

  if (details.includes(item?.category)) return item.category;
  if (category === "기타대응" && item?.category === "실종") return "실종";
  if (category === "교통사고등안전대응" && item?.category === "교통사고") return "교통사고";

  return details[details.length - 1] || "";
}

function countIncidentByMajor(list, major) {
  return countBy(list, (r) => normalizeIncidentCategory(r.category) === major);
}

function countIncidentByDetail(list, major, detail) {
  return countBy(list, (r) => normalizeIncidentCategory(r.category) === major && getIncidentDetail(r) === detail);
}

function updateIncidentDetailOptions(categoryId, detailId, selected = "") {
  const categoryEl = $(categoryId);
  const detailEl = $(detailId);

  if (!categoryEl || !detailEl) return;

  const category = normalizeIncidentCategory(categoryEl.value);
  const details = incidentCategoryGroups[category] || [];

  detailEl.innerHTML = details.map((detail) => `<option value="${escapeHtml(detail)}">${escapeHtml(detail)}</option>`).join("");
  detailEl.value = details.includes(selected) ? selected : (details[0] || "");
}

function dailyCountSet(date) {
  const ym = getMonthlyKeyFromDate(date);
  const dayRealtime = realtimeRecords.filter((r) => isRecordOnWorkDate(r, date));
  const monthRealtime = realtimeRecords.filter((r) => isRecordInPeriodToDate(r, ym, date));
  const dayCivil = civilRecords.filter((r) => isRecordOnWorkDate(r, date));
  const monthCivil = civilRecords.filter((r) => isRecordInPeriodToDate(r, ym, date));
  const dayPolice = policeRecords.filter((r) => isRecordOnWorkDate(r, date));
  const monthPolice = policeRecords.filter((r) => isRecordInPeriodToDate(r, ym, date));
  const dayVideo = videoRecords.filter((r) => isRecordOnWorkDate(r, date));
  const monthVideo = videoRecords.filter((r) => isRecordInPeriodToDate(r, ym, date));
  const dayInfo = infoRecords.filter((r) => isRecordOnWorkDate(r, date));
  const monthInfo = infoRecords.filter((r) => isRecordInPeriodToDate(r, ym, date));

  const realtime = realtimeCategories.map((category) => ({
    category,
    today: countIncidentByMajor(dayRealtime, category),
    month: countIncidentByMajor(monthRealtime, category),
  }));

  const civil = [
    { label: "비상벨 대응", today: countBy(dayCivil, (r) => r.type === "비상벨대응"), month: countBy(monthCivil, (r) => r.type === "비상벨대응") },
    { label: "비상벨 기타", today: countBy(dayCivil, (r) => r.type === "비상벨기타"), month: countBy(monthCivil, (r) => r.type === "비상벨기타") },
    { label: "비상벨 계도", today: countBy(dayCivil, (r) => r.type === "비상벨계도"), month: countBy(monthCivil, (r) => r.type === "비상벨계도") },
    { label: "전화민원", today: countBy(dayCivil, (r) => r.type === "전화민원"), month: countBy(monthCivil, (r) => r.type === "전화민원") },
    { label: "정보공개", today: dayInfo.length, month: monthInfo.length },
  ];

  return {
    realtime,
    civil,
    police: { today: dayPolice.length, month: monthPolice.length },
    video: { today: dayVideo.length, month: monthVideo.length },
    totals: {
      today: dayRealtime.length + dayCivil.length + dayPolice.length + dayVideo.length + dayInfo.length,
      month: monthRealtime.length + monthCivil.length + monthPolice.length + monthVideo.length + monthInfo.length,
    },
  };
}

function openReportPreview(type, value) {
  const html = type === "daily" ? buildDailyReport(value) : buildMonthlyReport(value);
  $("reportModalTitle").textContent = type === "daily" ? "일일근무일지 미리보기" : "월현황보고서 미리보기";
  $("reportPreviewBody").innerHTML = html;
  $("reportModal").classList.add("show");
}

function closeReportPreview() {
  $("reportModal").classList.remove("show");
}

function printReportPreview() {
  document.body.classList.add("printingReport");
  window.print();
  setTimeout(() => document.body.classList.remove("printingReport"), 500);
}

function getDailyLogRows(date) {
  const realtime = realtimeRecords.filter((r) => isRecordOnWorkDate(r, date)).map((r) => ({
    sortTime: r.startTime || "",
    time: [r.startTime, r.dispatchTime, r.endTime].filter(Boolean).join(" / "),
    manageNo: r.manageNo,
    location: r.location,
    category: `${normalizeIncidentCategory(r.category)} / ${getIncidentDetail(r)}`,
    content: r.content,
    result: r.note,
  }));

  const bellResponse = civilRecords.filter((r) => isRecordOnWorkDate(r, date) && r.type === "비상벨대응").map((r) => ({
    sortTime: r.time || "",
    time: r.time || "",
    manageNo: r.manageNo,
    location: r.location,
    category: "비상벨대응",
    content: r.content,
    result: r.action,
  }));

  return [...realtime, ...bellResponse].sort((a, b) => String(a.sortTime).localeCompare(String(b.sortTime)));
}

function buildDailyReport(date) {
  const counts = dailyCountSet(date);
  const realtimeRows = getDailyLogRows(date).slice(0, 4);

  const dayRealtime = realtimeRecords.filter((r) => isRecordOnWorkDate(r, date));
  const dayCivil = civilRecords.filter((r) => isRecordOnWorkDate(r, date));
  const dayPolice = policeRecords.filter((r) => isRecordOnWorkDate(r, date));
  const dayVideo = videoRecords.filter((r) => isRecordOnWorkDate(r, date));
  const dayInfo = infoRecords.filter((r) => isRecordOnWorkDate(r, date));

  const monthKey = getMonthlyKeyFromDate(date);
  const monthRealtime = realtimeRecords.filter((r) => isRecordInPeriodToDate(r, monthKey, date));
  const monthCivil = civilRecords.filter((r) => isRecordInPeriodToDate(r, monthKey, date));
  const monthPolice = policeRecords.filter((r) => isRecordInPeriodToDate(r, monthKey, date));
  const monthVideo = videoRecords.filter((r) => isRecordInPeriodToDate(r, monthKey, date));
  const monthInfo = infoRecords.filter((r) => isRecordInPeriodToDate(r, monthKey, date));

  const dailyCols = [
    { label: "강력<br>범죄", day: countIncidentByMajor(dayRealtime, "강력"), month: countIncidentByMajor(monthRealtime, "강력") },
    { label: "경범죄", day: countIncidentByMajor(dayRealtime, "경범죄"), month: countIncidentByMajor(monthRealtime, "경범죄") },
    { label: "청소년<br>비위", day: countIncidentByMajor(dayRealtime, "청소년비위"), month: countIncidentByMajor(monthRealtime, "청소년비위") },
    { label: "재난/<br>화재", day: countIncidentByMajor(dayRealtime, "재난/화재"), month: countIncidentByMajor(monthRealtime, "재난/화재") },
    { label: "교통사고<br>안전대응", day: countIncidentByMajor(dayRealtime, "교통사고등안전대응"), month: countIncidentByMajor(monthRealtime, "교통사고등안전대응") },
    { label: "기타<br>사항", day: countIncidentByMajor(dayRealtime, "기타대응"), month: countIncidentByMajor(monthRealtime, "기타대응") },
    { label: "대응", day: countBy(dayCivil, (r) => r.type === "비상벨대응"), month: countBy(monthCivil, (r) => r.type === "비상벨대응") },
    { label: "기타", day: countBy(dayCivil, (r) => r.type === "비상벨기타"), month: countBy(monthCivil, (r) => r.type === "비상벨기타") },
    { label: "계도", day: countBy(dayCivil, (r) => r.type === "비상벨계도"), month: countBy(monthCivil, (r) => r.type === "비상벨계도") },
    { label: "전화<br>민원", day: countBy(dayCivil, (r) => r.type === "전화민원") + dayInfo.length, month: countBy(monthCivil, (r) => r.type === "전화민원") + monthInfo.length },
    { label: "경찰<br>관제<br>요청", day: dayPolice.length, month: monthPolice.length },
    { label: "영상<br>열람<br>반출", day: dayVideo.length, month: monthVideo.length },
  ];

  const specialPolice = dayPolice;
  const phoneCivil = dayCivil.filter((r) => r.type === "전화민원");
  const specialCivil = dayCivil.filter((r) => r.type !== "전화민원");
  const info = dayInfo;

  return `
    <article class="reportDoc dailyReport reportPaper">
      <h1 class="dailyTitle">CCTV 관제 근무일지(${escapeHtml(formatReportDateTitle(date))})</h1>
      <p class="reportWorker dailyWorker">■ 근무자 : ${escapeHtml(getUserName())} (${escapeHtml(settings.activeTeam || "1조")} / ${escapeHtml(getWorkAreaLabel(parseDateOnly(date)))})</p>

      <h2 class="dailySection">■ CCTV 관제 대응 실적</h2>
      <table class="dailyStatsTable reportTable">
        <thead>
          <tr>
            <th rowspan="3" class="dailyTotalHead">합계</th>
            <th colspan="6">실시간 사건·사고 경찰신고</th>
            <th colspan="4">민원처리</th>
            <th rowspan="3">경찰<br>관제<br>요청</th>
            <th rowspan="3">영상<br>열람<br>반출</th>
          </tr>
          <tr>
            <th rowspan="2">강력<br>범죄</th>
            <th rowspan="2">경범죄</th>
            <th rowspan="2">청소년<br>비위</th>
            <th rowspan="2">재난/<br>화재</th>
            <th rowspan="2">교통사고<br>안전대응</th>
            <th rowspan="2">기타<br>사항</th>
            <th colspan="3">비상벨</th>
            <th rowspan="2">전화<br>민원</th>
          </tr>
          <tr><th>대응</th><th>기타</th><th>계도</th></tr>
        </thead>
        <tbody>
          <tr><th>금일건수</th>${dailyCols.map((item) => `<td>${item.day}</td>`).join("")}</tr>
          <tr><th>월 누계</th>${dailyCols.map((item) => `<td>${item.month}</td>`).join("")}</tr>
        </tbody>
      </table>

      <h2 class="dailySection">■ CCTV 관제일지(모니터링 : ${escapeHtml(getWorkAreaLabel(parseDateOnly(date)))})</h2>
      <table class="dailyLogTable reportTable">
        <thead>
          <tr><th class="dailyNoHead"></th><th>시간</th><th>CCTV<br>관리번호</th><th>위치</th><th>구분</th><th>관제내용</th><th>결과</th></tr>
        </thead>
        <tbody>
          ${[0, 1, 2, 3].map((idx) => {
            const r = realtimeRows[idx];
            return `<tr><td>${idx + 1}</td><td>${escapeHtml(r ? r.time || "" : "")}</td><td>${escapeHtml(r?.manageNo || "")}</td><td>${escapeHtml(r?.location || "")}</td><td>${escapeHtml(r?.category || "")}</td><td>${escapeHtml(r?.content || "")}</td><td>${escapeHtml(r?.result || "")}</td></tr>`;
          }).join("")}
        </tbody>
      </table>

      <h2 class="dailySection">■ CCTV 관제 특이사항(상세내용)</h2>
      <table class="dailySpecialTable reportTable">
        <tbody>
          <tr><th>경찰서 상황실,<br>지구대 요청에<br>따른 조치사항</th><td>${reportLines(specialPolice.map(reportPoliceLine))}</td></tr>
          <tr><th>전화 민원<br>(정보공개 청구 등)</th><td>${reportLines([...phoneCivil.map(reportCivilLine), ...info.map(reportInfoLine)])}</td></tr>
          <tr><th>고장 신고 접수</th><td></td></tr>
          <tr><th>기타 특이사항</th><td>${reportLines(specialCivil.map(reportCivilLine))}</td></tr>
        </tbody>
      </table>
    </article>
  `;
}
function formatDetailCounts(list, major) {
  const details = incidentCategoryGroups[major] || [];
  return details.map((detail) => `${escapeHtml(detail)}( ${countIncidentByDetail(list, major, detail)}건)`).join(", ");
}

function buildMonthlyReport(key) {
  const title = key.length === 4 ? `${key}년` : `${Number(key.slice(0, 4))}년 ${Number(key.slice(5, 7))}월`;
  const periodRealtime = realtimeRecords.filter((r) => isRecordInPeriod(r, key));
  const periodPolice = policeRecords.filter((r) => isRecordInPeriod(r, key));
  const rt = realtimeCategories.map((category) => countIncidentByMajor(periodRealtime, category));
  const civil = {
    bellResponse: countBy(civilRecords, (r) => isRecordInPeriod(r, key) && r.type === "비상벨대응"),
    bellGuide: countBy(civilRecords, (r) => isRecordInPeriod(r, key) && r.type === "비상벨계도"),
    bellEtc: countBy(civilRecords, (r) => isRecordInPeriod(r, key) && r.type === "비상벨기타"),
    phone: countBy(civilRecords, (r) => isRecordInPeriod(r, key) && r.type === "전화민원"),
    info: countBy(infoRecords, (r) => isRecordInPeriod(r, key)),
  };
  const police = policeCategories.map((category) => countIncidentByMajor(periodPolice, category));
  const video = videoCategories.map((category) => countBy(videoRecords, (r) => isRecordInPeriod(r, key) && r.category === category));
  const videoView = countBy(videoRecords, (r) => isRecordInPeriod(r, key) && r.process === "열람");
  const videoCopy = countBy(videoRecords, (r) => isRecordInPeriod(r, key) && r.process === "복제");
  const mainSpecials = [
    ...personalSpecials.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ ...item, specialKind: "개인특이사항" })),
    ...teamSpecials.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ ...item, specialKind: "조특이사항" })),
  ];
  const bellSpecials = civilRecords.filter((r) => isRecordInPeriod(r, key) && ["비상벨대응", "비상벨계도", "비상벨기타"].includes(r.type));

  const totalRow = [
    ...rt,
    civil.bellResponse,
    civil.bellGuide,
    civil.bellEtc,
    civil.phone,
    civil.info,
    sum(police),
    videoView + videoCopy,
  ];
  const responseTotal = sum(rt) + civil.bellResponse + civil.bellGuide + civil.bellEtc + civil.phone + civil.info;

  return `
    <article class="reportDoc monthlyReport reportPaper">
      <p class="reportTo">국장님</p>
      <h1 class="monthlyTitle">${escapeHtml(title)} CCTV통합관제센터<br>모니터링 및 영상제공 현황 보고</h1>

      <div class="monthlySectionTitle"><span>Ⅰ</span><strong>관제센터 근무현황</strong></div>
      <table class="reportTable monthlyStaffTable">
        <tbody>
          <tr><th rowspan="2">계</th><th colspan="2">관제요원</th><th rowspan="2">유지보수</th></tr>
          <tr><th>공무원</th><th>경찰관</th></tr>
          <tr><td>18명</td><td>16명</td><td>1명</td><td>1명</td></tr>
        </tbody>
      </table>
      <p class="monthlyNote">24시간 근무 : 시간선택제임기제 공무원(4조 3교대, 1조 4명)<br>삼산경찰서 경찰관(1명, 주간근무 09:00~18:00)</p>

      <div class="monthlySectionTitle"><span>Ⅱ</span><strong>CCTV 관제대응 실적</strong></div>
      <h2 class="monthlySubTitle">□ 근무자 대응 현황 <em>(단위 : 건)</em></h2>
      ${buildMonthlyWorkerTable(key, totalRow)}

      <h2 class="monthlySubTitle">□ CCTV 관제 상세내용 <em>(단위 : 건)</em></h2>
      <table class="reportTable monthlyDetailTable">
        <tbody>
          <tr><th>구 분</th><th>상세내용</th><th>계</th></tr>
          <tr><th>총 계</th><td></td><td>${responseTotal}</td></tr>
          <tr><th>강력범죄</th><td>${formatDetailCounts(periodRealtime, "강력")}</td><td>${rt[0]}</td></tr>
          <tr><th>경범죄</th><td>${formatDetailCounts(periodRealtime, "경범죄")}</td><td>${rt[1]}</td></tr>
          <tr><th>청소년 비위</th><td>${formatDetailCounts(periodRealtime, "청소년비위")}</td><td>${rt[2]}</td></tr>
          <tr><th>재난 / 화재</th><td>${formatDetailCounts(periodRealtime, "재난/화재")}</td><td>${rt[3]}</td></tr>
          <tr><th>교통사고 등<br>안전대응</th><td>${formatDetailCounts(periodRealtime, "교통사고등안전대응")}</td><td>${rt[4]}</td></tr>
          <tr><th>기타사항</th><td>${formatDetailCounts(periodRealtime, "기타대응")}</td><td>${rt[5]}</td></tr>
          <tr><th>민원응대</th><td>비상벨 대응( ${civil.bellResponse}건), 비상벨 계도( ${civil.bellGuide}건), 비상벨 기타( ${civil.bellEtc}건)<br>전화 민원( ${civil.phone}건), 정보공개청구( ${civil.info}건)<br>안심in 서비스 긴급도움 접수( 0건)</td><td>${civil.bellResponse + civil.bellGuide + civil.bellEtc + civil.phone + civil.info}</td></tr>
        </tbody>
      </table>

      <h2 class="monthlySubTitle">□ 사회복무요원 근무</h2>
      <table class="reportTable monthlyServiceTable"><tbody><tr><th>현 황</th><th>근무 내용</th><th>비 고</th></tr><tr><td>·기존 사회복무요원 26.1.3.자 소집해제</td><td></td><td>·신규 사회복무요원 배치 미정</td></tr></tbody></table>

      <h2 class="monthlySubTitle">□ CCTV 관제요청 현황 [경찰서 → 관제센터] <em>(단위 : 건)</em></h2>
      <table class="reportTable monthlySimpleTable"><thead><tr><th>합 계</th><th>강력범죄</th><th>경범죄</th><th>청소년 비위</th><th>재난/화재</th><th>교통사고 등<br>안전대응</th><th>기타대응</th></tr></thead><tbody><tr><td>${sum(police)}</td>${police.map((v) => `<td>${v}</td>`).join("")}</tr></tbody></table>

      <h2 class="monthlySubTitle">□ CCTV 영상자료 열람·제공 [관제센터 → 요청기관 및 부서] <em>(단위 : 건)</em></h2>
      <table class="reportTable monthlySimpleTable"><tbody><tr><th>구 분</th><th>계</th><th>경찰서</th><th>자원순환과</th><th>동행정복지센터</th><th>타기관(통계)</th><th>기타(법원 등)</th></tr><tr><th>열 람</th><td>${videoView}</td><td>${videoView}</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><th>제 공</th><td>${videoCopy}</td><td>${videoCopy}</td><td>0</td><td>0</td><td>0</td><td>0</td></tr><tr><th>합 계</th><td>${videoView + videoCopy}</td><td>${videoView + videoCopy}</td><td>0</td><td>0</td><td>0</td><td>0</td></tr></tbody></table>

      <h2 class="monthlySubTitle">□ 열람·제공 CCTV 영상자료 활용 현황 <em>(단위 : 건)</em></h2>
      <table class="reportTable monthlySimpleTable"><thead><tr><th>합계</th>${videoCategories.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody><tr><td>${sum(video)}</td>${video.map((v) => `<td>${v}</td>`).join("")}</tr></tbody></table>

      <h2 class="monthlyRomanTitle">Ⅲ 주요 특이사항</h2>
      ${buildMonthlySpecialTable(mainSpecials, "police")}

      <h2 class="monthlyRomanTitle">Ⅳ 비상벨, 안심in</h2>
      ${buildMonthlySpecialTable(bellSpecials, "civil")}
    </article>
  `;
}


function getTeamMembersForReport(team) {
  const saved = settings.teams?.[team] || [];
  return [0, 1, 2, 3].map((idx) => saved[idx] || "");
}

function recordBelongsToMember(item, member) {
  if (!member) return false;
  return (item.user || getUserName()) === member;
}

function countMemberRecords(key, member) {
  const memberRealtime = realtimeRecords.filter((r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member));
  const rt = realtimeCategories.map((category) => countIncidentByMajor(memberRealtime, category));
  const bellResponse = countBy(civilRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member) && r.type === "비상벨대응");
  const bellGuide = countBy(civilRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member) && r.type === "비상벨계도");
  const bellEtc = countBy(civilRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member) && r.type === "비상벨기타");
  const phone = countBy(civilRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member) && r.type === "전화민원");
  const info = countBy(infoRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member));
  const police = countBy(policeRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member));
  const video = countBy(videoRecords, (r) => isRecordInPeriod(r, key) && recordBelongsToMember(r, member));
  return [...rt, bellResponse, bellGuide, bellEtc, phone, info, police, video];
}

function buildMonthlyWorkerTable(key, totalRow) {
  const teams = ["1조", "2조", "3조", "4조"];
  return `
    <table class="reportTable monthlyWorkerTable">
      <thead>
        <tr>
          <th rowspan="3">구분</th>
          <th rowspan="3">성명</th>
          <th colspan="6">실시간 사건·사고 신고</th>
          <th colspan="5">민원처리</th>
          <th colspan="2">업무협조</th>
        </tr>
        <tr>
          <th rowspan="2">강력<br>범죄</th><th rowspan="2">경범<br>죄</th><th rowspan="2">청소년<br>비위</th><th rowspan="2">재난/<br>화재</th><th rowspan="2">교통<br>안전대응</th><th rowspan="2">기타<br>사항</th>
          <th colspan="3">비상벨</th><th rowspan="2">전화<br>민원</th><th rowspan="2">정보<br>공개<br>청구</th>
          <th rowspan="2">경찰<br>관제<br>요청</th><th rowspan="2">영상<br>열람<br>반출</th>
        </tr>
        <tr><th>대응</th><th>계도</th><th>기타</th></tr>
      </thead>
      <tbody>
        <tr class="reportTotalRow"><th colspan="2">계</th>${totalRow.map((v) => `<td>${v || ""}</td>`).join("")}</tr>
        ${teams.map((team) => {
          const members = getTeamMembersForReport(team);
          return members.map((member, idx) => {
            const values = countMemberRecords(key, member);
            return `<tr>${idx === 0 ? `<th rowspan="4">${team}</th>` : ""}<th>${escapeHtml(member)}</th>${values.map((v) => `<td>${v || ""}</td>`).join("")}</tr>`;
          }).join("");
        }).join("")}
      </tbody>
    </table>
  `;
}

function buildMonthlySpecialTable(items, kind) {
  if (!items.length) {
    return `<table class="reportTable monthlySpecialOutput"><tbody><tr><th>일 시</th><th>주 요 내 용</th></tr><tr><td colspan="2">기록 없음</td></tr></tbody></table>`;
  }

  return `
    <table class="reportTable monthlySpecialOutput">
      <tbody>
        <tr><th>일 시</th><th>주 요 내 용</th></tr>
        ${items.map((item) => {
          const title = kind === "civil" ? reportCivilLine(item) : (item.specialKind === "개인특이사항" ? reportPersonalLine(item) : reportPoliceLine(item));
          return `<tr><td>${escapeHtml(settings.activeTeam || "")}<br>${escapeHtml(formatKoreanDate(item.date))}<br>${escapeHtml(getShift(parseDateOnly(item.date)))}</td><td>${title}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}


function reportLines(lines) {
  return lines.length ? lines.map((line) => `<p>${line}</p>`).join("") : "";
}

function reportPoliceLine(item) {
  const title = item.specialTitle || item.category || "경찰관제요청";
  const operators = item.operators || item.user || getUserName();
  return `□ [${escapeHtml(title)}]<br>- 장    소: ${escapeHtml(item.location || "")} (${escapeHtml(item.manageNo || "")})<br>- 관제요원: ${escapeHtml(operators)}<br>- 사건개요: ${escapeHtml(item.content || "")}<br>- 처리결과: ${escapeHtml(item.action || "")}`;
}

function reportPersonalLine(item) {
  return `□ [${escapeHtml(item.specialKind || "개인특이사항")} / ${escapeHtml(item.category || "")}]<br>- 장    소: ${escapeHtml(item.location || "")} (${escapeHtml(item.manageNo || "")})<br>- 관제요원: ${escapeHtml(item.user || getUserName())}<br>- 사건개요: ${escapeHtml(item.content || "")}<br>- 처리결과: ${escapeHtml(item.note || "")}`;
}

function reportCivilLine(item) {
  const operators = item.operators || item.user || getUserName();
  return `□ [${escapeHtml(item.specialTitle || item.type || "민원처리")}]<br>- 장    소: ${escapeHtml(item.location || "")} (${escapeHtml(item.manageNo || "")})<br>- 관제요원: ${escapeHtml(operators)}<br>- 사건개요: ${escapeHtml(item.content || "")}<br>- 처리결과: ${escapeHtml(item.action || "")}`;
}

function reportInfoLine(item) {
  const desired = formatInfoDesired(item);
  return `□ [정보공개 ${escapeHtml(item.result || "")}]<br>- 접수번호: ${escapeHtml(item.receiptNo || "")}<br>- 청구일: ${escapeHtml(item.claimDate || "")}<br>- 열람희망: ${escapeHtml(desired)}<br>- 관리번호: ${escapeHtml(item.manageNo || "")}<br>- 청구인: ${escapeHtml(item.claimantName || "")}<br>- 사건개요: ${escapeHtml(item.content || "")}<br>- 처리결과: ${escapeHtml(item.note || item.result || "")}`;
}

function renderMonthSearch() {
  const result = $("monthSearchResult");
  if (!result) return;

  const query = $("monthSearchInput").value.trim().toLowerCase();
  const scope = $("monthSearchScope").value;
  const key = getPeriodKey();

  if (!query) {
    result.innerHTML = "검색어를 입력하면 해당 월 자료를 찾아 표시합니다.";
    return;
  }

  const refs = collectPeriodItems(key)
    .map(({ group, item }) => ({ group, item, type: groupToType(group), text: getSearchText(item, scope).toLowerCase() }))
    .filter(({ text }) => text.includes(query))
    .map(({ type, item, group }) => ref(type, item, group))
    .filter(({ type }) => type);

  result.innerHTML = refs.length ? renderRecordList(refs) : '<div class="emptyList">검색 결과 없음</div>';

  result.querySelectorAll("[data-edit-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.editType;
      const id = btn.dataset.editId;
      const record = findRecord(type, id);
      if (record) openInputModal(type, record);
    });
  });
}

function groupToType(group) {
  if (group === "실시간 개인실적" || group === "개인특이사항") return "realtime";
  if (group === "민원처리") return "civil";
  if (group === "경찰관제요청" || group === "조특이사항") return "police";
  if (group === "영상열람반출") return "video";
  if (group === "정보공개") return "info";
  return "";
}

function getSearchText(item, scope) {
  const approvalDoc = item.approval ? [item.approval.docNo, item.approval.keyword, item.approval.content].join(" ") : "";
  const destroyDoc = item.destroy ? [item.destroy.docNo, item.destroy.sendDocNo, item.destroy.content].join(" ") : "";

  if (scope === "manageNo") return item.manageNo || "";
  if (scope === "location") return item.location || "";
  if (scope === "agency") return item.agency || item.approval?.org || item.destroy?.org || "";
  if (scope === "content") return [item.content, item.action, item.note, approvalDoc, destroyDoc].join(" ");
  if (scope === "docNo") return [item.receiptNo, item.approval?.docNo, item.destroy?.docNo, item.destroy?.sendDocNo].join(" ");

  return [
    item.date, item.time, item.startTime, item.dispatchTime, item.endTime, item.agency, item.specialTitle, item.operators, item.manageNo, item.location, item.category, item.detailCategory, item.type, item.process,
    item.agency, item.complainantInfo, item.complainantPhone, item.claimDate, item.desiredDate, item.desiredTime, item.result, item.claimantName, item.claimantPhone, item.receiptNo, item.content, item.action, item.note,
    approvalDoc, destroyDoc,
  ].join(" ");
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
    ...realtimeRecords.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "실시간 개인실적", item })),
    ...civilRecords.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "민원처리", item })),
    ...policeRecords.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "경찰관제요청", item })),
    ...videoRecords.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "영상열람반출", item })),
    ...infoRecords.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "정보공개", item })),
    ...personalSpecials.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "개인특이사항", item })),
    ...teamSpecials.filter((r) => isRecordInPeriod(r, key)).map((item) => ({ group: "조특이사항", item })),
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

  const incidentDisplayMap = {
    "강력": "강력",
    "경범죄": "경범죄",
    "청소년비위": "청소년<br>비위",
    "재난/화재": "재난<br>화재",
    "교통사고등안전대응": "교통<br>안전",
    "기타대응": "기타<br>대응",
  };

  return incidentDisplayMap[label] || escapeHtml(label);
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
