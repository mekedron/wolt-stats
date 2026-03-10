export type DashboardFilters = {
	userId: string;
	country: string;
	currency: string;
	city: string;
	venueId: string;
	productLine: string;
	dayKind: string;
	daypart: string;
	startDate: string;
	endDate: string;
};

export type FilterOption = {
	value: string;
	label: string;
};

export type FilterOptionGroup = {
	label: string;
	options: FilterOption[];
};

export type VenueOptionGroup = {
	city: string;
	country: string;
	options: FilterOption[];
};

export type FilterMetadata = {
	users: FilterOption[];
	countries: FilterOption[];
	currencies: FilterOption[];
	cities: FilterOption[];
	venues: VenueOptionGroup[];
	productLines: FilterOption[];
	dayKinds: FilterOption[];
	dayparts: FilterOption[];
	minDate: string;
	maxDate: string;
};

export type CurrencyAmount = {
	currency: string;
	amountMinor: number;
};

export type OrderLineItem = {
	itemName: string;
	lineTotalMinor: number;
	quantity: number;
	unitPriceMinor: number;
};

export type OrderRecord = {
	currency: string;
	deliveryCity: string | null;
	feeShare: number | null;
	feesMinor: number;
	items: OrderLineItem[];
	itemsSummary: string | null;
	orderLocalDate: string | null;
	orderLocalDateTime: string | null;
	orderNumber: string | null;
	paymentMethodName: string | null;
	paymentTimeTs: number;
	productLine: string | null;
	purchaseId: string;
	totalMinor: number;
	venueCountry: string;
	venueId: string | null;
	venueName: string;
};

export type OrderLedgerPage = {
	limit: number | null;
	offset: number;
	orders: OrderRecord[];
	totalOrders: number;
};

export type SummaryMetrics = {
	totalOrders: number;
	activeDays: number;
	activeCountries: number;
	avgFeeRate: number;
	totalSpend: CurrencyAmount[];
	medianOrderValue: CurrencyAmount[];
	lastOrderDate: string | null;
	topVenue: VenueRank | null;
	topItem: ItemRank | null;
};

export type SeriesPoint = {
	label: string;
	series: string;
	value: number;
};

export type MetricSeriesPoint = {
	currency: string;
	label: string;
	metric: string;
	value: number;
};

export type BarDatum = {
	label: string;
	value: number;
};

export type HeatCell = {
	weekday: number;
	hour: number;
	value: number;
};

export type VenueRank = {
	venueId?: string | null;
	name: string;
	country: string;
	currency: string;
	orderCount: number;
	totalMinor: number;
};

export type ItemRank = {
	name: string;
	currency: string;
	unitCount: number;
	orderCount: number;
};

export type Freshness = {
	catalogOrders: number;
	catalogShortfall: number;
	coverageEnd: string | null;
	coverageStart: string | null;
	lastSyncAt: string | null;
	missingDetails: number;
	expectedOrders: number | null;
	syncedUsers: number;
	totalOrders: number;
};

export type CurrencyTrendPulse = {
	currency: string;
	medianDeltaRatio: number | null;
	orderDeltaRatio: number | null;
	previousAvgMonthlyOrders: number | null;
	previousAvgMonthlySpendMinor: number | null;
	previousMedianMinor: number | null;
	recentAvgMonthlyOrders: number;
	recentAvgMonthlySpendMinor: number;
	recentMedianMinor: number;
	spendDeltaRatio: number | null;
};

export type RankItem = {
	title: string;
	subtitle: string;
	valueLabel: string;
	intensity: number;
	meta?: string;
};

export type ProductProfile = {
	firstSeen: string | null;
	lastSeen: string | null;
	latestListedPrices: CurrencyAmount[];
	latestObservedPrices: CurrencyAmount[];
	medianListedPrices: CurrencyAmount[];
	medianObservedPrices: CurrencyAmount[];
	name: string;
	orderCount: number;
	unitCount: number;
	venueCount: number;
};

export type MenuMemoryItem = {
	currency: string;
	lastSeen: string | null;
	latestUnitPriceMinor: number | null;
	medianUnitPriceMinor: number | null;
	name: string;
	orderCount: number;
	unitCount: number;
};

export type VenueSnapshot = {
	activeMonths: number;
	avgFeeRate: number;
	city: string | null;
	country: string;
	firstSeen: string | null;
	lastSeen: string | null;
	medianOrderValue: CurrencyAmount[];
	productLine: string | null;
	totalOrders: number;
	totalSpend: CurrencyAmount[];
	venueId: string | null;
	venueName: string;
};
