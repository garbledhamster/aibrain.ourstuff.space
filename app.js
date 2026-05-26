const runtimeConfig = window.AI_BRAIN_ADMIN_CONFIG || {};

const state = {
	categories: [],
	auth: null,
	firebaseReady: false,
	user: null,
	idToken: "",
	entitlement: null,
	usage: null,
	apiKeys: [],
	events: [],
	oneTimeKey: "",
	accountRefresh: null,
	localAuthExplicit: false,
	loadedViews: new Set(),
	viewLoads: {},
};

const els = {
	apiBase: document.querySelector("#apiBase"),
	token: document.querySelector("#token"),
	status: document.querySelector("#status"),
	viewTitle: document.querySelector("#viewTitle"),
	authState: document.querySelector("#authState"),
	authMessage: document.querySelector("#authMessage"),
	userLabel: document.querySelector("#userLabel"),
	firebaseLabel: document.querySelector("#firebaseLabel"),
	apiLabel: document.querySelector("#apiLabel"),
	tokenLabel: document.querySelector("#tokenLabel"),
	accountOutput: document.querySelector("#accountOutput"),
	email: document.querySelector("#email"),
	password: document.querySelector("#password"),
	cloudState: document.querySelector("#cloudState"),
	quotaUsed: document.querySelector("#quotaUsed"),
	quotaLimit: document.querySelector("#quotaLimit"),
	quotaMeter: document.querySelector("#quotaMeter"),
	planLabel: document.querySelector("#planLabel"),
	subscriptionLabel: document.querySelector("#subscriptionLabel"),
	coverageLabel: document.querySelector("#coverageLabel"),
	billingOutput: document.querySelector("#billingOutput"),
	keyLimitLabel: document.querySelector("#keyLimitLabel"),
	apiKeyName: document.querySelector("#apiKeyName"),
	oneTimeKeyWrap: document.querySelector("#oneTimeKeyWrap"),
	oneTimeKey: document.querySelector("#oneTimeKey"),
	apiKeyList: document.querySelector("#apiKeyList"),
	apiKeyCount: document.querySelector("#apiKeyCount"),
	readsUsage: document.querySelector("#readsUsage"),
	writesUsage: document.querySelector("#writesUsage"),
	aiUsage: document.querySelector("#aiUsage"),
	blockedUsage: document.querySelector("#blockedUsage"),
	usageDay: document.querySelector("#usageDay"),
	usageScope: document.querySelector("#usageScope"),
	readsMeter: document.querySelector("#readsMeter"),
	writesMeter: document.querySelector("#writesMeter"),
	aiMeter: document.querySelector("#aiMeter"),
	activityList: document.querySelector("#activityList"),
	output: document.querySelector("#output"),
	category: document.querySelector("#category"),
	projectSlug: document.querySelector("#projectSlug"),
	sourceApp: document.querySelector("#sourceApp"),
	tags: document.querySelector("#tags"),
	memoryText: document.querySelector("#memoryText"),
	allowRawStorage: document.querySelector("#allowRawStorage"),
	memorySearch: document.querySelector("#memorySearch"),
	memoryStatus: document.querySelector("#memoryStatus"),
	memoryList: document.querySelector("#memoryList"),
	contextProject: document.querySelector("#contextProject"),
	contextConsumer: document.querySelector("#contextConsumer"),
	contextOutput: document.querySelector("#contextOutput"),
	auditList: document.querySelector("#auditList"),
};

function setStatus(message, tone = "") {
	els.status.textContent = message;
	els.status.className = `status ${tone}`.trim();
	if (els.authMessage) {
		els.authMessage.textContent = message;
		els.authMessage.className = `auth-message ${tone}`.trim();
	}
}

function isLocalPage() {
	return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function defaultApiBase() {
	return isLocalPage()
		? runtimeConfig.localApiBase || "http://localhost:8800/api/v1"
		: runtimeConfig.productionApiBase || "https://api.ourstuff.space/v1";
}

function apiBase() {
	return els.apiBase.value.replace(/\/$/, "");
}

function isPlaceholder(value) {
	return !value || /^<.+>$/.test(value);
}

function firebaseConfigured() {
	const firebase = runtimeConfig.firebase || {};
	return (
		Boolean(
			firebase.apiKey &&
				firebase.authDomain &&
				firebase.projectId &&
				firebase.appId,
		) &&
		![
			firebase.apiKey,
			firebase.authDomain,
			firebase.projectId,
			firebase.appId,
		].some(isPlaceholder)
	);
}

function initializeConnectionFields() {
	const params = new URLSearchParams(window.location.search);
	const apiFromUrl = params.get("api");
	els.apiBase.value =
		apiFromUrl ||
		sessionStorage.getItem("aiBrainAdminApiBase") ||
		defaultApiBase();
	if (isLocalPage()) {
		const tokenFromSession = sessionStorage.getItem("aiBrainAdminToolToken");
		if (tokenFromSession) {
			els.token.value = tokenFromSession;
			state.localAuthExplicit = true;
		} else if (runtimeConfig.localDevToken) {
			els.token.value = runtimeConfig.localDevToken;
		}
	} else {
		els.token.value = "";
		sessionStorage.removeItem("aiBrainAdminToolToken");
	}
	updateConnectionLabels();
}

function appAccessAllowed() {
	return (
		Boolean(state.user) || (isLocalPage() && Boolean(els.token.value.trim()))
	);
}

function autoLoadAllowed() {
	return Boolean(state.user) || (isLocalPage() && state.localAuthExplicit);
}

function updateAuthShell() {
	const allowed = appAccessAllowed();
	document.body.classList.toggle("is-signed-out", !allowed);
	document.body.classList.toggle("is-authenticated", allowed);
	if (!allowed) {
		activateView("account", true);
	}
}

async function activeToken(forceRefresh = false) {
	const toolToken = els.token.value.trim();
	sessionStorage.setItem("aiBrainAdminApiBase", els.apiBase.value);
	if (isLocalPage() && toolToken) {
		sessionStorage.setItem("aiBrainAdminToolToken", toolToken);
		state.localAuthExplicit = true;
	} else {
		sessionStorage.removeItem("aiBrainAdminToolToken");
	}
	if (state.user) {
		state.idToken = await state.user.getIdToken(forceRefresh);
		updateConnectionLabels();
		return state.idToken;
	}
	return isLocalPage() ? toolToken : "";
}

async function requestHeaders({ forceRefresh = false } = {}) {
	const headers = {
		"Content-Type": "application/json",
	};
	const token = await activeToken(forceRefresh);
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	return headers;
}

async function api(path, options = {}) {
	let response;
	const url = `${apiBase()}${path}`;
	const {
		forceRefreshToken = false,
		retriedAuth = false,
		...fetchOptions
	} = options;
	try {
		response = await fetch(url, {
			...fetchOptions,
			headers: {
				...(await requestHeaders({ forceRefresh: forceRefreshToken })),
				...(fetchOptions.headers || {}),
			},
		});
	} catch (error) {
		throw new Error(
			`Network/CORS request failed for ${url}. Check the API base and allowed request headers. ${error.message}`,
		);
	}
	const text = await response.text();
	let data = {};
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { raw: text };
	}
	if (!response.ok) {
		const code = data?.error?.code ? ` ${data.error.code}` : "";
		const message =
			data?.error?.message ||
			data?.message ||
			data?.raw ||
			response.statusText ||
			"Request failed";
		const error = new Error(`${response.status}${code} at ${path}: ${message}`);
		error.status = response.status;
		error.code = data?.error?.code || "";
		error.endpoint = path;
		error.details = data?.error?.details;
		if (!retriedAuth && shouldRefreshFirebaseToken(error)) {
			setStatus("Refreshing sign-in token...", "");
			return api(path, {
				...fetchOptions,
				forceRefreshToken: true,
				retriedAuth: true,
			});
		}
		throw error;
	}
	return data;
}

function shouldRefreshFirebaseToken(error) {
	if (!state.user) {
		return false;
	}
	const text = `${error.code || ""} ${error.message || ""}`.toLowerCase();
	return (
		(error.status === 401 || error.status === 500) &&
		(text.includes("id token has expired") ||
			text.includes("auth/id-token-expired") ||
			text.includes("firebase_token_expired"))
	);
}

function writeAccount(value) {
	els.accountOutput.textContent = JSON.stringify(value, null, 2);
}

function writeBilling(value) {
	els.billingOutput.textContent = JSON.stringify(value, null, 2);
}

function writeOutput(value) {
	els.output.textContent = JSON.stringify(value, null, 2);
}

function apiErrorDetails(error) {
	return {
		ok: false,
		status: error.status || null,
		code: error.code || null,
		endpoint: error.endpoint || null,
		message: error.message,
		details: error.details,
	};
}

function showApiError(error, writer = writeOutput) {
	writer(apiErrorDetails(error));
	setStatus(error.message, "bad");
}

function formatBytes(value = 0) {
	if (!value) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = value;
	let index = 0;
	while (size >= 1000 && index < units.length - 1) {
		size /= 1000;
		index += 1;
	}
	return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function updateConnectionLabels() {
	els.userLabel.textContent =
		state.user?.email ||
		state.user?.uid ||
		(isLocalPage() && els.token.value.trim()
			? "Local dev token"
			: "Not signed in");
	els.firebaseLabel.textContent = state.firebaseReady
		? "Configured"
		: "Not configured";
	els.tokenLabel.textContent = state.idToken
		? "Firebase ID token active"
		: isLocalPage() && els.token.value
			? "Tool token active"
			: "None";
	els.authState.textContent = state.user
		? "Signed in"
		: isLocalPage() && els.token.value.trim()
			? "Local auth"
			: "Signed out";
	document.querySelector("#signOutBtn").hidden = !state.user;
	updateAuthShell();
}

function updateEntitlement(entitlement) {
	state.entitlement = entitlement;
	if (!entitlement) {
		els.cloudState.textContent = "Unknown";
		els.planLabel.textContent = "None";
		els.subscriptionLabel.textContent = "Unknown";
		els.coverageLabel.textContent = "Not loaded";
		els.quotaUsed.textContent = "0 B";
		els.quotaLimit.textContent = "0 B";
		els.quotaMeter.value = 0;
		els.quotaMeter.textContent = "0%";
		return;
	}

	const used = entitlement.usedBytes || 0;
	const quota = entitlement.quotaBytes || 0;
	const percent = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
	els.cloudState.textContent = entitlement.cloud
		? "Cloud active"
		: "Cloud inactive";
	els.planLabel.textContent = entitlement.plan || "None";
	els.subscriptionLabel.textContent =
		entitlement.subscriptionStatus || "inactive";
	els.coverageLabel.textContent = entitlement.cloud
		? `${entitlement.poolName || "ourstuff.space shared pool"} covers AI Brain`
		: "Subscribe on ourstuff.space to unlock the shared pool";
	els.quotaUsed.textContent = formatBytes(used);
	els.quotaLimit.textContent = formatBytes(quota);
	els.quotaMeter.value = percent;
	els.quotaMeter.textContent = `${percent}%`;
}

function updateUsage(usage) {
	state.usage = usage;
	if (!usage) {
		usage = {
			day: "UTC day",
			reads: { used: 0, limit: 300 },
			writes: { used: 0, limit: 50 },
			ai: { used: 0, limit: 30 },
			blocked: 0,
		};
	}
	const readPercent = usage.reads.limit
		? Math.min(100, Math.round((usage.reads.used / usage.reads.limit) * 100))
		: 0;
	const writePercent = usage.writes.limit
		? Math.min(100, Math.round((usage.writes.used / usage.writes.limit) * 100))
		: 0;
	const aiPercent = usage.ai.limit
		? Math.min(100, Math.round((usage.ai.used / usage.ai.limit) * 100))
		: 0;
	els.readsUsage.textContent = `${usage.reads.used} / ${usage.reads.limit}`;
	els.writesUsage.textContent = `${usage.writes.used} / ${usage.writes.limit}`;
	els.aiUsage.textContent = `${usage.ai.used} / ${usage.ai.limit}`;
	els.blockedUsage.textContent = `${usage.blocked || 0}`;
	els.usageDay.textContent = `${usage.day} UTC`;
	els.usageScope.textContent =
		usage.scope && usage.source
			? `${usage.scope} ${usage.source}`
			: "ourstuff.space global";
	els.readsMeter.style.width = `${readPercent}%`;
	els.writesMeter.style.width = `${writePercent}%`;
	els.aiMeter.style.width = `${aiPercent}%`;
}

function clearAccountData() {
	updateEntitlement(null);
	updateUsage(null);
	renderApiKeys([]);
	renderActivity([]);
	state.loadedViews.clear();
	state.viewLoads = {};
	writeAccount({});
	writeBilling({});
}

function hasAuthToken() {
	return (
		Boolean(state.user) || (isLocalPage() && Boolean(els.token.value.trim()))
	);
}

function requireAccountAuth(action = "refresh account data") {
	if (hasAuthToken()) {
		return true;
	}
	activateView("account", true);
	setStatus(`Sign in to ${action}`, "bad");
	return false;
}

async function refreshSignedInAccount() {
	if (!requireAccountAuth("refresh account data")) {
		return;
	}
	if (!autoLoadAllowed()) {
		return;
	}
	if (state.accountRefresh) {
		return state.accountRefresh;
	}
	state.accountRefresh = (async () => {
		setStatus("Loading account data...", "");
		if (await bootstrapUser()) {
			state.loadedViews.add("account");
		}
		if (await loadCategories()) {
			state.loadedViews.add("capture");
		}
		const currentView = activeViewId();
		if (!state.loadedViews.has(currentView)) {
			await loadViewData(currentView, { force: true });
		}
	})().finally(() => {
		state.accountRefresh = null;
	});
	return state.accountRefresh;
}

function selectedApiKeyScopes() {
	return [...document.querySelectorAll(".api-key-scope:checked")].map(
		(input) => input.value,
	);
}

function apiKeyItem(key) {
	const item = document.createElement("article");
	item.className = "item";
	const head = document.createElement("div");
	head.className = "item-head";
	const title = document.createElement("div");
	const h3 = document.createElement("h3");
	h3.textContent = key.name || `Key ${key.prefix}`;
	const summary = document.createElement("p");
	summary.textContent = `${key.prefix} - created ${new Date(key.createdAt).toLocaleString()}`;
	title.append(h3, summary);
	head.append(title, chip(key.status));

	const chips = document.createElement("div");
	chips.className = "chips";
	for (const scope of key.scopes) {
		chips.append(chip(scope.replace("brain:", "")));
	}
	if (key.lastUsedAt) {
		chips.append(chip(`used ${new Date(key.lastUsedAt).toLocaleString()}`));
	}

	const actions = document.createElement("div");
	actions.className = "item-actions";
	if (key.status === "active") {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = "Revoke";
		button.addEventListener("click", () => revokeKey(key.id));
		actions.append(button);
	}

	item.append(head, chips, actions);
	return item;
}

function renderApiKeys(keys = []) {
	state.apiKeys = keys;
	const activeCount = keys.filter((key) => key.status === "active").length;
	els.apiKeyCount.textContent = `${activeCount} active`;
	els.keyLimitLabel.textContent = `${activeCount} / 1 active`;
	els.apiKeyList.replaceChildren(...keys.map(apiKeyItem));
}

function eventItem(event) {
	const item = document.createElement("article");
	item.className = "item";
	const head = document.createElement("div");
	head.className = "item-head";
	const title = document.createElement("div");
	const h3 = document.createElement("h3");
	h3.textContent = event.eventType || event.action;
	const summary = document.createElement("p");
	summary.textContent = [event.operation, event.status, event.apiKeyPrefix]
		.filter(Boolean)
		.join(" - ");
	title.append(h3, summary);
	head.append(title, chip(new Date(event.createdAt).toLocaleString()));
	const details = document.createElement("pre");
	details.textContent = JSON.stringify(event.metadata || {}, null, 2);
	item.append(head, details);
	return item;
}

function renderActivity(events = []) {
	state.events = events;
	els.activityList.replaceChildren(...events.map(eventItem));
}

async function initializeFirebase() {
	if (!firebaseConfigured()) {
		state.firebaseReady = false;
		updateConnectionLabels();
		return;
	}

	const version = runtimeConfig.firebaseSdkVersion || "11.10.0";
	const [{ initializeApp }, authModule] = await Promise.all([
		import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
		import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
	]);
	const app = initializeApp(runtimeConfig.firebase);
	state.auth = authModule.getAuth(app);
	await authModule.setPersistence(
		state.auth,
		authModule.browserLocalPersistence,
	);
	state.firebaseReady = true;

	authModule.onAuthStateChanged(state.auth, async (user) => {
		state.user = user;
		state.idToken = user ? await user.getIdToken() : "";
		updateConnectionLabels();
		if (user) {
			setStatus("Signed in. Refreshing account data...", "good");
			await refreshSignedInAccount();
		} else {
			clearAccountData();
		}
	});
	state.authModule = authModule;
	updateConnectionLabels();
}

async function signInWithGoogle() {
	if (!state.firebaseReady) {
		setStatus("Add Firebase web config first", "bad");
		return;
	}
	try {
		const provider = new state.authModule.GoogleAuthProvider();
		provider.setCustomParameters({ prompt: "select_account" });
		await state.authModule.signInWithPopup(state.auth, provider);
		setStatus("Signed in with Google", "good");
	} catch (error) {
		setStatus(error.message, "bad");
	}
}

async function signIn(event) {
	event.preventDefault();
	if (!state.firebaseReady) {
		setStatus("Add Firebase web config first", "bad");
		return;
	}
	try {
		await state.authModule.signInWithEmailAndPassword(
			state.auth,
			els.email.value.trim(),
			els.password.value,
		);
		setStatus("Signed in", "good");
	} catch (error) {
		setStatus(error.message, "bad");
	}
}

async function createAccount() {
	if (!state.firebaseReady) {
		setStatus("Add Firebase web config first", "bad");
		return;
	}
	try {
		await state.authModule.createUserWithEmailAndPassword(
			state.auth,
			els.email.value.trim(),
			els.password.value,
		);
		setStatus("Account created", "good");
	} catch (error) {
		setStatus(error.message, "bad");
	}
}

async function signOutUser() {
	try {
		if (state.auth) {
			await state.authModule.signOut(state.auth);
		}
		state.user = null;
		state.idToken = "";
		clearAccountData();
		updateConnectionLabels();
		setStatus("Signed out");
	} catch (error) {
		setStatus(error.message, "bad");
	}
}

async function checkHealth() {
	try {
		const data = await api("/health", { method: "POST" });
		els.apiLabel.textContent = `${data.service} (${data.store})`;
		writeAccount(data);
		setStatus("API health ok", "good");
	} catch (error) {
		els.apiLabel.textContent = "Health check failed";
		setStatus(error.message, "bad");
	}
}

async function bootstrapUser() {
	if (!requireAccountAuth("bootstrap your account")) {
		return false;
	}
	try {
		const data = await api("/bootstrap-user", {
			method: "POST",
			body: JSON.stringify({}),
		});
		if (state.user) {
			state.idToken = await state.user.getIdToken(true);
		}
		updateEntitlement(data.entitlement);
		updateUsage(data.usage);
		renderApiKeys(data.keys || []);
		renderActivity(data.events || []);
		writeAccount(data);
		setStatus("Bootstrap complete", "good");
		return true;
	} catch (error) {
		showApiError(error, writeAccount);
		return false;
	} finally {
		updateConnectionLabels();
	}
}

async function loadUsage() {
	if (!requireAccountAuth("load usage")) {
		return false;
	}
	try {
		const data = await api("/account/usage");
		updateUsage(data.usage);
		setStatus("Usage loaded", "good");
		return true;
	} catch (error) {
		showApiError(error, writeAccount);
		return false;
	}
}

async function loadApiKeys() {
	if (!requireAccountAuth("load API keys")) {
		return false;
	}
	try {
		const data = await api("/api-keys");
		renderApiKeys(data.keys || []);
		setStatus(`${data.keys.length} API keys`, "good");
		return true;
	} catch (error) {
		showApiError(error, writeBilling);
		return false;
	}
}

async function createKey(event) {
	event.preventDefault();
	if (!requireAccountAuth("create an API key")) {
		return;
	}
	try {
		const data = await api("/api-keys", {
			method: "POST",
			body: JSON.stringify({
				name: els.apiKeyName.value.trim(),
				scopes: selectedApiKeyScopes(),
			}),
		});
		state.oneTimeKey = data.apiKey;
		els.oneTimeKey.textContent = data.apiKey;
		els.oneTimeKeyWrap.hidden = false;
		await loadApiKeys();
		await loadActivity();
		setStatus("API key created", "good");
	} catch (error) {
		showApiError(error);
	}
}

async function revokeKey(keyId) {
	if (!requireAccountAuth("revoke an API key")) {
		return;
	}
	try {
		await api(`/api-keys/${encodeURIComponent(keyId)}`, { method: "DELETE" });
		await loadApiKeys();
		await loadActivity();
		setStatus("API key revoked", "good");
	} catch (error) {
		showApiError(error);
	}
}

async function copyOneTimeKey() {
	try {
		if (!state.oneTimeKey) {
			return;
		}
		await navigator.clipboard.writeText(state.oneTimeKey);
		setStatus("Key copied", "good");
	} catch (error) {
		setStatus(error.message, "bad");
	}
}

async function loadActivity() {
	if (!requireAccountAuth("load activity")) {
		return false;
	}
	try {
		const data = await api("/account/events?limit=50");
		renderActivity(data.events || []);
		setStatus(`${data.events.length} events`, "good");
		return true;
	} catch (error) {
		showApiError(error, writeAccount);
		return false;
	}
}

async function refreshEntitlement() {
	if (!requireAccountAuth("load subscription plan")) {
		return false;
	}
	try {
		const data = await api("/billing/entitlement");
		updateEntitlement(data.entitlement);
		writeBilling(data);
		setStatus(
			data.entitlement.cloud
				? "Cloud entitlement active"
				: "Cloud entitlement inactive",
			data.entitlement.cloud ? "good" : "",
		);
		return true;
	} catch (error) {
		showApiError(error, writeBilling);
		return false;
	}
}

function returnUrl() {
	return `${window.location.origin}${window.location.pathname}`;
}

function subscriptionSiteId() {
	return runtimeConfig.siteId || "ourstuff";
}

async function startCheckout() {
	if (!requireAccountAuth("start checkout")) {
		return;
	}
	try {
		const data = await api("/subscriptions/checkout", {
			method: "POST",
			body: JSON.stringify({
				site: subscriptionSiteId(),
				appId: runtimeConfig.appId || "aibrain",
				returnUrl: returnUrl(),
			}),
		});
		writeBilling(data);
		if (data.entitlement) {
			updateEntitlement(data.entitlement);
		}
		if (data.url) {
			window.location.href = data.url;
			return;
		}
		setStatus(
			data.alreadyCovered
				? "Already covered by ourstuff.space"
				: data.message || "Checkout ready",
			"good",
		);
	} catch (error) {
		showApiError(error);
	}
}

async function openPortal() {
	if (!requireAccountAuth("open the billing portal")) {
		return;
	}
	try {
		const data = await api("/subscriptions/portal", {
			method: "POST",
			body: JSON.stringify({
				site: subscriptionSiteId(),
				returnUrl: returnUrl(),
			}),
		});
		writeBilling(data);
		if (data.url) {
			window.location.href = data.url;
			return;
		}
		setStatus(data.message || "No billing portal needed", "good");
	} catch (error) {
		showApiError(error, writeBilling);
	}
}

async function localSubscription(path, label) {
	if (!requireAccountAuth("change local subscription state")) {
		return;
	}
	try {
		const data = await api(path, { method: "POST", body: JSON.stringify({}) });
		updateEntitlement(data.entitlement);
		writeBilling(data);
		setStatus(label, "good");
	} catch (error) {
		showApiError(error, writeBilling);
	}
}

async function loadCategories() {
	if (!requireAccountAuth("load categories")) {
		return false;
	}
	try {
		const data = await api("/categories");
		state.categories = data.categories;
		els.category.replaceChildren(
			...data.categories.map((category) => {
				const option = document.createElement("option");
				option.value = category.label;
				option.textContent = category.label;
				return option;
			}),
		);
		return true;
	} catch (error) {
		showApiError(error);
		return false;
	}
}

async function scrubMemory() {
	if (!requireAccountAuth("scrub memory")) {
		return;
	}
	try {
		const data = await api("/scrub", {
			method: "POST",
			body: JSON.stringify({ text: els.memoryText.value }),
		});
		writeOutput(data);
		setStatus(
			data.blocked ? "Blocked content detected" : "Scrub complete",
			data.blocked ? "bad" : "good",
		);
	} catch (error) {
		showApiError(error);
	}
}

function selectedConsumers() {
	return [...document.querySelectorAll(".consumer-option:checked")].map(
		(input) => input.value,
	);
}

function tagsFromInput() {
	return els.tags.value
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

async function rememberMemory(event) {
	event.preventDefault();
	if (!requireAccountAuth("save memory")) {
		return;
	}
	try {
		const data = await api("/remember", {
			method: "POST",
			body: JSON.stringify({
				projectSlug: els.projectSlug.value,
				sourceApp: els.sourceApp.value,
				text: els.memoryText.value,
				userSuggestedCategory: els.category.value,
				userSuggestedTags: tagsFromInput(),
				allowRawStorage: els.allowRawStorage.checked,
				allowedConsumers: selectedConsumers(),
			}),
		});
		writeOutput(data);
		setStatus(`Saved ${data.memoryId}`, "good");
		await loadMemories();
		await refreshEntitlement();
	} catch (error) {
		showApiError(error);
	}
}

function chip(text) {
	const span = document.createElement("span");
	span.className = "chip";
	span.textContent = text;
	return span;
}

function memoryItem(memory) {
	const item = document.createElement("article");
	item.className = "item";

	const head = document.createElement("div");
	head.className = "item-head";

	const title = document.createElement("div");
	const h3 = document.createElement("h3");
	h3.textContent = memory.title;
	const summary = document.createElement("p");
	summary.textContent = memory.summary;
	title.append(h3, summary);

	const status = document.createElement("span");
	status.className = "chip";
	status.textContent = memory.status;
	head.append(title, status);

	const chips = document.createElement("div");
	chips.className = "chips";
	for (const value of [
		memory.categoryLabel,
		memory.sensitivity,
		...memory.tags.slice(0, 6),
	]) {
		chips.append(chip(value));
	}

	const actions = document.createElement("div");
	actions.className = "item-actions";
	[
		["Approve", "approve"],
		["Lock", "lock"],
		["Archive", "archive"],
		["Reject", "reject"],
		["Delete", "delete"],
	].forEach(([label, action]) => {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.addEventListener("click", () => runMemoryAction(memory.id, action));
		actions.append(button);
	});

	item.append(head, chips, actions);
	return item;
}

async function loadMemories() {
	if (!requireAccountAuth("load memories")) {
		return false;
	}
	try {
		const params = new URLSearchParams();
		if (els.memorySearch.value) {
			params.set("q", els.memorySearch.value);
		}
		if (els.memoryStatus.value) {
			params.set("status", els.memoryStatus.value);
		}
		const data = await api(`/memories?${params.toString()}`);
		els.memoryList.replaceChildren(...data.memories.map(memoryItem));
		setStatus(`${data.memories.length} memories`, "good");
		return true;
	} catch (error) {
		showApiError(error);
		return false;
	}
}

async function runMemoryAction(id, action) {
	if (!requireAccountAuth(`${action} memory`)) {
		return;
	}
	try {
		const method = action === "delete" ? "DELETE" : "POST";
		const path =
			action === "delete" ? `/memories/${id}` : `/memories/${id}/${action}`;
		const data = await api(path, { method });
		writeOutput(data);
		setStatus(`${action} complete`, "good");
		await loadMemories();
	} catch (error) {
		showApiError(error);
	}
}

async function loadContext(rebuild = false) {
	if (!requireAccountAuth(rebuild ? "rebuild context" : "load context")) {
		return false;
	}
	try {
		const project = encodeURIComponent(els.contextProject.value);
		const consumer = encodeURIComponent(els.contextConsumer.value);
		const path = `/projects/${project}/context${rebuild ? "/rebuild" : ""}?consumer=${consumer}`;
		const data = await api(path, { method: rebuild ? "POST" : "GET" });
		els.contextOutput.textContent = JSON.stringify(data, null, 2);
		setStatus(rebuild ? "Context rebuilt" : "Context loaded", "good");
		return true;
	} catch (error) {
		els.contextOutput.textContent = JSON.stringify(
			apiErrorDetails(error),
			null,
			2,
		);
		setStatus(error.message, "bad");
		return false;
	}
}

function auditItem(event) {
	const item = document.createElement("article");
	item.className = "item";
	const head = document.createElement("div");
	head.className = "item-head";
	const title = document.createElement("div");
	const h3 = document.createElement("h3");
	h3.textContent = event.action;
	const summary = document.createElement("p");
	summary.textContent = `${event.targetType}${event.targetId ? `: ${event.targetId}` : ""}`;
	title.append(h3, summary);
	head.append(title, chip(new Date(event.createdAt).toLocaleString()));
	const details = document.createElement("pre");
	details.textContent = JSON.stringify(event.metadata, null, 2);
	item.append(head, details);
	return item;
}

async function loadAudit() {
	if (!requireAccountAuth("load audit events")) {
		return false;
	}
	try {
		const data = await api("/audit");
		els.auditList.replaceChildren(...data.events.map(auditItem));
		setStatus(`${data.events.length} audit events`, "good");
		return true;
	} catch (error) {
		showApiError(error);
		return false;
	}
}

function activeViewId() {
	return document.querySelector(".view.is-active")?.id || "account";
}

async function loadViewData(view, { force = false } = {}) {
	if (!appAccessAllowed() || !autoLoadAllowed()) {
		return false;
	}
	if (!force && state.loadedViews.has(view)) {
		return true;
	}
	if (state.viewLoads[view]) {
		return state.viewLoads[view];
	}

	const loaders = {
		account: bootstrapUser,
		billing: refreshEntitlement,
		apiKeys: loadApiKeys,
		usage: loadUsage,
		activity: loadActivity,
		capture: loadCategories,
		memories: loadMemories,
		context: () => loadContext(false),
		audit: loadAudit,
	};
	const loader = loaders[view];
	if (!loader) {
		return false;
	}

	state.viewLoads[view] = Promise.resolve(loader())
		.then((loaded) => {
			if (loaded !== false) {
				state.loadedViews.add(view);
				return true;
			}
			return false;
		})
		.finally(() => {
			delete state.viewLoads[view];
		});
	return state.viewLoads[view];
}

function activateView(view, bypassAuthGate = false) {
	if (!bypassAuthGate && !appAccessAllowed()) {
		view = "account";
		setStatus("Sign in with Firebase to continue", "bad");
	}
	for (const tab of document.querySelectorAll(".tab")) {
		tab.classList.toggle("is-active", tab.dataset.view === view);
	}
	for (const panel of document.querySelectorAll(".view")) {
		panel.classList.toggle("is-active", panel.id === view);
	}
	const titles = {
		account: "Account",
		billing: "Billing",
		apiKeys: "API Keys",
		usage: "Usage",
		activity: "Activity",
		capture: "Capture Memory",
		memories: "Memory Queue",
		context: "Project Context",
		audit: "Audit Trail",
	};
	els.viewTitle.textContent = titles[view] || "AI Brain";
	void loadViewData(view);
}

document.querySelectorAll(".tab").forEach((tab) => {
	tab.addEventListener("click", () => activateView(tab.dataset.view));
});

document.querySelector("#authForm").addEventListener("submit", signIn);
document
	.querySelector("#googleSignInBtn")
	.addEventListener("click", signInWithGoogle);
document
	.querySelector("#createAccountBtn")
	.addEventListener("click", createAccount);
document.querySelector("#signOutBtn").addEventListener("click", signOutUser);
document.querySelector("#healthBtn").addEventListener("click", checkHealth);
document.querySelector("#localTokenBtn").addEventListener("click", () => {
	els.token.value = runtimeConfig.localDevToken || "dev-local-token";
	state.localAuthExplicit = true;
	state.loadedViews.clear();
	updateConnectionLabels();
	setStatus("Local dev token loaded", "good");
	void refreshSignedInAccount();
});
document
	.querySelector("#bootstrapBtn")
	.addEventListener("click", bootstrapUser);
document
	.querySelector("#refreshEntitlementBtn")
	.addEventListener("click", refreshEntitlement);
document.querySelector("#apiKeyForm").addEventListener("submit", createKey);
document
	.querySelector("#refreshKeysBtn")
	.addEventListener("click", loadApiKeys);
document.querySelector("#copyKeyBtn").addEventListener("click", copyOneTimeKey);
document.querySelector("#refreshUsageBtn").addEventListener("click", loadUsage);
document
	.querySelector("#refreshActivityBtn")
	.addEventListener("click", loadActivity);
document.querySelector("#checkoutBtn").addEventListener("click", startCheckout);
document.querySelector("#portalBtn").addEventListener("click", openPortal);
if (isLocalPage()) {
	document
		.querySelector("#mockSubscribeBtn")
		.addEventListener("click", () =>
			localSubscription("/billing/mock-subscribe", "Local subscription active"),
		);
	document
		.querySelector("#mockCancelBtn")
		.addEventListener("click", () =>
			localSubscription("/billing/mock-cancel", "Local subscription cleared"),
		);
} else {
	document.querySelector(".local-actions")?.remove();
}
document
	.querySelector("#clearBillingBtn")
	.addEventListener("click", () => writeBilling({}));
document.querySelector("#scrubBtn").addEventListener("click", scrubMemory);
document
	.querySelector("#rememberForm")
	.addEventListener("submit", rememberMemory);
document
	.querySelector("#clearOutputBtn")
	.addEventListener("click", () => writeOutput({}));
document
	.querySelector("#refreshMemoriesBtn")
	.addEventListener("click", loadMemories);
document
	.querySelector("#loadContextBtn")
	.addEventListener("click", () => loadContext(false));
document
	.querySelector("#rebuildContextBtn")
	.addEventListener("click", () => loadContext(true));
document.querySelector("#loadAuditBtn").addEventListener("click", loadAudit);

initializeConnectionFields();
await initializeFirebase();
if (appAccessAllowed()) {
	setStatus(state.user ? "Signed in" : "Local auth ready", "good");
	await refreshSignedInAccount();
} else {
	setStatus("Sign in with Firebase to continue.");
}
