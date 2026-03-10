import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { faker } from '@faker-js/faker';

import {
	ensureSchema,
	insertSyncRun,
	slugify,
	updateSyncState,
	upsertOrderBundle,
	upsertOrderCatalogEntry,
	upsertUser,
} from './wolt-sync-db.mjs';

export const DEFAULT_DEMO_END_DATE = '2026-03-10';

const USER_PROFILES = [
	{
		email: 'nikita.demo@example.com',
		label: 'Nikita Demo',
		orderCount: 192,
		regionWeights: [
			{ value: 'FIN', weight: 64 },
			{ value: 'POL', weight: 18 },
			{ value: 'GEO', weight: 18 },
		],
		recentBiasExponent: 0.82,
	},
	{
		email: 'alina.demo@example.com',
		label: 'Alina Demo',
		orderCount: 128,
		regionWeights: [
			{ value: 'FIN', weight: 56 },
			{ value: 'POL', weight: 28 },
			{ value: 'GEO', weight: 16 },
		],
		recentBiasExponent: 0.9,
	},
];

const REGION_TEMPLATES = {
	FIN: {
		country: 'FIN',
		currency: 'EUR',
		deliveryFeeRange: [149, 329],
		lateFeeLiftRange: [40, 110],
		serviceFeeRange: [69, 159],
		surchargeChance: 0.08,
		venues: [
			createVenue(
				'espoo-smash-lab',
				'Smash Lab Olari',
				'Espoo',
				'restaurant',
				22,
				[
					createItem(
						'double-smash-combo',
						'Double Smash Combo',
						1290,
						220,
						0.36,
						[
							createOptionGroup('Burger extras', [
								createOption('extra-cheese', 'Extra cheese', 120, 0.34),
								createOption('jalapenos', 'Jalapenos', 90, 0.2),
							]),
						],
					),
					createItem('hot-honey-chicken', 'Hot Honey Chicken', 1370, 180, 0.28),
					createItem('loaded-fries', 'Loaded Fries', 490, 80, 0.16),
					createItem('zero-cola', 'Zero Cola', 290, 25, 0.08),
				],
			),
			createVenue(
				'helsinki-noodle-room',
				'Noodle Room Kallio',
				'Helsinki',
				'restaurant',
				17,
				[
					createItem('tonkotsu-ramen', 'Tonkotsu Ramen', 1490, 210, 0.18),
					createItem('karaage-rice', 'Karaage Rice Bowl', 1390, 170, 0.22),
					createItem('chili-dumplings', 'Chili Dumplings', 690, 110, 0.1),
					createItem('matcha-soda', 'Matcha Soda', 390, 45, 0.04),
				],
			),
			createVenue(
				'niittykumpu-market',
				'Neighborhood Market Niittykumpu',
				'Espoo',
				'grocery',
				9,
				[
					createItem('protein-pudding', 'Protein Pudding', 249, 22, 0.06),
					createItem('cold-brew-can', 'Cold Brew Can', 329, 34, 0.05),
					createItem('sourdough-sandwich', 'Sourdough Sandwich', 599, 65, 0.08),
					createItem('berries-bowl', 'Berry Bowl', 449, 48, 0.04),
				],
			),
			createVenue(
				'night-owl-pharmacy',
				'Night Owl Pharmacy',
				'Helsinki',
				'pharmacy',
				5,
				[
					createItem('electrolyte-tabs', 'Electrolyte Tabs', 899, 35, 0),
					createItem('vitamin-shot-pack', 'Vitamin Shot Pack', 1299, 45, 0),
					createItem('pain-relief-pack', 'Pain Relief Pack', 749, 24, 0),
				],
			),
		],
	},
	POL: {
		country: 'POL',
		currency: 'PLN',
		deliveryFeeRange: [499, 899],
		lateFeeLiftRange: [90, 180],
		serviceFeeRange: [199, 349],
		surchargeChance: 0.12,
		venues: [
			createVenue(
				'krakow-pierogi-lab',
				'Pierogi Lab',
				'Kraków',
				'restaurant',
				11,
				[
					createItem('smash-pierogi-box', 'Smash Pierogi Box', 3890, 540, 0.22),
					createItem('zurek-bowl', 'Zurek Bowl', 3490, 420, 0.16),
					createItem('pickled-fries', 'Pickled Fries', 1390, 180, 0.08),
					createItem('cloud-lemonade', 'Cloud Lemonade', 1290, 110, 0.04),
				],
			),
			createVenue(
				'warszawa-night-kebab',
				'Night Kebab Plac',
				'Warszawa',
				'restaurant',
				8,
				[
					createItem('mega-kebab-wrap', 'Mega Kebab Wrap', 3290, 470, 0.24),
					createItem('halloumi-box', 'Halloumi Box', 2990, 360, 0.14),
					createItem('garlic-fries', 'Garlic Fries', 1190, 130, 0.07),
				],
			),
			createVenue(
				'krakow-baltic-basket',
				'Baltic Basket',
				'Kraków',
				'grocery',
				4,
				[
					createItem('cold-brew-4-pack', 'Cold Brew 4-pack', 1690, 160, 0.03),
					createItem('protein-yogurt', 'Protein Yogurt', 590, 55, 0.02),
					createItem('sourdough-toastie', 'Sourdough Toastie', 1290, 120, 0.05),
				],
			),
			createVenue(
				'warszawa-hop-house',
				'Hop House Express',
				'Warszawa',
				'alcohol',
				3,
				[
					createItem('pilsner-6-pack', 'Pilsner 6-pack', 2490, 240, 0),
					createItem('ginger-tonic-mix', 'Ginger Tonic Mix', 1190, 100, 0),
				],
			),
		],
	},
	GEO: {
		country: 'GEO',
		currency: 'GEL',
		deliveryFeeRange: [250, 499],
		lateFeeLiftRange: [60, 140],
		serviceFeeRange: [99, 219],
		surchargeChance: 0.1,
		venues: [
			createVenue(
				'batumi-sunset-shawarma',
				'Sunset Shawarma',
				'Batumi',
				'restaurant',
				10,
				[
					createItem('fire-shawarma', 'Fire Shawarma', 1840, 260, 0.26),
					createItem(
						'double-fried-potatoes',
						'Double Fried Potatoes',
						690,
						90,
						0.11,
					),
					createItem('tarragon-soda', 'Tarragon Soda', 390, 40, 0.03),
				],
			),
			createVenue(
				'tbilisi-khinkali-social',
				'Khinkali Social',
				"T'bilisi",
				'restaurant',
				9,
				[
					createItem('khinkali-set', 'Khinkali Set', 1980, 280, 0.14),
					createItem('ojakhuri-bowl', 'Ojakhuri Bowl', 2290, 320, 0.16),
					createItem('adjika-potatoes', 'Adjika Potatoes', 790, 95, 0.08),
				],
			),
			createVenue(
				'vake-city-market',
				'City Market Vake',
				"T'bilisi",
				'grocery',
				4,
				[
					createItem('matsoni-pack', 'Matsoni Pack', 590, 45, 0.02),
					createItem('khachapuri-slice', 'Khachapuri Slice', 850, 70, 0.04),
					createItem('orange-soda-pack', 'Orange Soda Pack', 780, 55, 0.02),
				],
			),
			createVenue(
				'batumi-night-bites',
				'Night Bites Batumi',
				'Batumi',
				'restaurant',
				3,
				[
					createItem(
						'crispy-chicken-box',
						'Crispy Chicken Box',
						1690,
						230,
						0.18,
					),
					createItem('garlic-sauce-pot', 'Garlic Sauce Pot', 290, 25, 0),
				],
			),
		],
	},
};

/**
 * @param {string} sourcePath
 * @param {{ backupPath?: string; now?: Date }} [options]
 * @returns {string | null}
 */
export function backupExistingDatabase(sourcePath, options = {}) {
	if (!existsSync(sourcePath)) {
		return null;
	}

	const now = options.now ?? new Date();
	const backupPath =
		options.backupPath ?? `${sourcePath}-${stampForFileName(now)}.bak`;
	mkdirSync(dirname(backupPath), { recursive: true });
	copyFileSync(sourcePath, backupPath);
	return backupPath;
}

/**
 * @param {import('sql.js').Database} db
 * @param {{ endDate?: Date | string; seed?: number }} [options]
 * @returns {{ catalogOrders: number; detailOrders: number; endDate: string; startDate: string; users: number }}
 */
export function populateDemoDatabase(db, options = {}) {
	ensureSchema(db);

	const seed = Number.isFinite(options.seed) ? Number(options.seed) : 20260310;
	const endDate = normalizeEndDate(options.endDate);
	const startDate = addDays(endDate, -364);
	const startedAt = addMinutes(startDate, 9 * 60).toISOString();

	faker.seed(seed);

	let catalogOrders = 0;
	let detailOrders = 0;

	for (const [userIndex, userProfile] of USER_PROFILES.entries()) {
		const userId = slugify(userProfile.email);
		const userNowIso = endDate.toISOString();

		upsertUser(db, {
			nowIso: userNowIso,
			userEmail: userProfile.email,
			userId,
			userLabel: userProfile.label,
		});

		const orders = createOrdersForUser({
			orderCount: userProfile.orderCount,
			recentBiasExponent: userProfile.recentBiasExponent,
			regionWeights: userProfile.regionWeights,
			seed: seed + userIndex * 101,
			startDate,
			userId,
		});

		for (const order of orders) {
			upsertOrderCatalogEntry(db, {
				nowIso: userNowIso,
				summary: order.summary,
				userId,
			});
			upsertOrderBundle(db, {
				detail: order.detail,
				nowIso: userNowIso,
				purchaseId: order.summary.purchase_id,
				summary: order.summary,
				userId,
			});
		}

		const newestPaymentTimeTs =
			orders[orders.length - 1]?.summary.payment_time_ts ?? 0;
		updateSyncState(db, {
			catalogOrderCount: orders.length,
			detailOrderCount: orders.length,
			expectedOrderCount: orders.length,
			fullBackfillCompleted: true,
			newestPaymentTimeTs,
			nowIso: userNowIso,
			startedAt,
			userId,
		});
		insertSyncRun(db, {
			detailsFetched: orders.length,
			finishedAt: userNowIso,
			insertedOrders: orders.length,
			ordersScanned: orders.length,
			pagesFetched: Math.ceil(orders.length / 50),
			profileName: 'demo-generator',
			reachedHistoryEnd: true,
			startedAt,
			updatedOrders: 0,
			userId,
		});

		catalogOrders += orders.length;
		detailOrders += orders.length;
	}

	return {
		catalogOrders,
		detailOrders,
		endDate: toDateOnly(endDate),
		startDate: toDateOnly(startDate),
		users: USER_PROFILES.length,
	};
}

/**
 * @param {{
 *  orderCount: number;
 *  recentBiasExponent: number;
 *  regionWeights: Array<{ value: string; weight: number }>;
 *  seed: number;
 *  startDate: Date;
 *  userId: string;
 * }} options
 * @returns {Array<{ detail: any; summary: any }>}
 */
function createOrdersForUser({
	orderCount,
	recentBiasExponent,
	regionWeights,
	seed,
	startDate,
	userId,
}) {
	faker.seed(seed);
	/** @type {Array<{ detail: any; summary: any }>} */
	const orders = [];

	for (let index = 0; index < orderCount; index += 1) {
		const regionCode = pickWeighted(regionWeights);
		const region = REGION_TEMPLATES[regionCode];
		const venue = pickWeighted(
			region.venues.map((entry) => ({
				value: entry,
				weight: entry.visitWeight,
			})),
		);
		const progress = Math.pow(faker.number.float(), recentBiasExponent);
		const orderDate = addDays(startDate, Math.round(progress * 364));
		orderDate.setUTCHours(
			resolveOrderHour(),
			faker.number.int({ min: 0, max: 55 }),
			0,
			0,
		);

		const itemCount = pickWeighted([
			{ value: 1, weight: 54 },
			{ value: 2, weight: 31 },
			{ value: 3, weight: 15 },
		]);
		const itemTemplates = pickDistinctItems(venue.items, itemCount);
		const lineItems = itemTemplates.map((item) =>
			buildLineItem(item, progress, region.currency),
		);

		const itemsAmountMinor = lineItems.reduce(
			(sum, item) => sum + item.lineTotalMinor,
			0,
		);
		const deliveryFeeMinor =
			randomBetween(...region.deliveryFeeRange) +
			(progress > 0.5 ? randomBetween(...region.lateFeeLiftRange) : 0);
		const serviceFeeMinor =
			randomBetween(...region.serviceFeeRange) + Math.round(progress * 40);
		const discountMinor = resolveDiscountMinor(lineItems, itemsAmountMinor);
		const surchargeMinor =
			faker.number.float() < region.surchargeChance
				? randomBetween(40, 120)
				: 0;
		const subtotalMinor =
			itemsAmountMinor + deliveryFeeMinor + serviceFeeMinor + surchargeMinor;
		const totalMinor = Math.max(subtotalMinor - discountMinor, 0);
		const purchaseId = `${userId}-${toDateOnly(orderDate)}-${String(index + 1).padStart(4, '0')}-${faker.string.alphanumeric({ casing: 'lower', length: 4 })}`;
		const orderNumber = `${String(index + 1).padStart(3, '0')}-${faker.string.numeric(4)}`;
		const receivedAt = toWoltDateTime(orderDate);
		const deliveredAt = toWoltDateTime(
			addMinutes(orderDate, randomBetween(24, 58)),
		);
		const deliveryAlias = pickWeighted([
			{ value: 'Home', weight: 62 },
			{ value: 'Office', weight: 18 },
			{ value: 'Late shift', weight: 10 },
			{ value: 'Movie night', weight: 10 },
		]);

		const summary = {
			currency: region.currency,
			items_summary: lineItems.map((item) => item.name).join(', '),
			payment_time_ts: orderDate.getTime(),
			purchase_id: purchaseId,
			received_at: receivedAt,
			status: 'delivered',
			venue_name: venue.name,
		};

		const detail = {
			creation_time: receivedAt,
			currency: region.currency,
			delivery: {
				alias: deliveryAlias,
				city: venue.city,
			},
			delivery_method: 'homedelivery',
			delivery_time: deliveredAt,
			discounts:
				discountMinor > 0
					? [{ amount: { amount: discountMinor }, label: 'Weekly promo' }]
					: [],
			items: lineItems.map((item, itemIndex) => ({
				count: item.quantity,
				id: item.id || `${venue.id}-item-${itemIndex + 1}`,
				line_total: { amount: item.lineTotalMinor },
				name: item.name,
				options: item.options,
				price: { amount: item.unitPriceMinor },
			})),
			order_number: orderNumber,
			payments: [
				{
					amount: { amount: totalMinor },
					method_id: `pm-${faker.string.alphanumeric({ casing: 'lower', length: 6 })}`,
					method_type: 'card',
					name: 'Visa',
					payment_time: receivedAt,
					provider: 'demo-pay',
				},
			],
			status: 'delivered',
			surcharges:
				surchargeMinor > 0
					? [{ amount: { amount: surchargeMinor }, label: 'High demand' }]
					: [],
			totals: {
				credits: { amount: 0 },
				delivery: { amount: deliveryFeeMinor },
				items: { amount: itemsAmountMinor },
				service_fee: { amount: serviceFeeMinor },
				subtotal: { amount: subtotalMinor },
				tokens: { amount: 0 },
				total: { amount: totalMinor },
			},
			venue: {
				address: faker.location.streetAddress(),
				country: region.country,
				id: venue.id,
				name: venue.name,
				product_line: venue.productLine,
			},
		};

		orders.push({ detail, summary });
	}

	return orders.sort(
		(left, right) =>
			left.summary.payment_time_ts - right.summary.payment_time_ts ||
			String(left.summary.purchase_id).localeCompare(
				String(right.summary.purchase_id),
			),
	);
}

/**
 * @param {{ discountChance: number; name: string; optionGroups?: any[]; priceTrendMinor: number; startingPriceMinor: number }} item
 * @param {number} progress
 * @param {string} currency
 * @returns {{ currency: string; discountChance: number; id: string; lineTotalMinor: number; name: string; options: any[]; quantity: number; unitPriceMinor: number }}
 */
function buildLineItem(item, progress, currency) {
	const priceJitter = Math.round(
		(faker.number.float() - 0.5) * item.priceTrendMinor * 0.18,
	);
	const basePriceMinor = roundMinor(
		item.startingPriceMinor +
			Math.round(progress * item.priceTrendMinor) +
			priceJitter,
	);
	const quantity = resolveQuantity(item.name);
	const options = buildOptionSelections(item.optionGroups ?? []);
	const optionsMinor = options.reduce(
		(sum, option) =>
			sum +
			option.values.reduce(
				(optionSum, value) => optionSum + Number(value.price?.amount ?? 0),
				0,
			),
		0,
	);
	const unitPriceMinor = Math.max(basePriceMinor + optionsMinor, 0);

	return {
		currency,
		discountChance: item.discountChance,
		id: item.id,
		lineTotalMinor: unitPriceMinor * quantity,
		name: item.name,
		options,
		quantity,
		unitPriceMinor,
	};
}

/**
 * @param {any[]} optionGroups
 * @returns {any[]}
 */
function buildOptionSelections(optionGroups) {
	return optionGroups.flatMap((group) => {
		const values = group.values
			.filter((value) => faker.number.float() < value.chance)
			.map((value) => ({
				count: 1,
				id: value.id,
				name: value.name,
				price: { amount: value.priceMinor },
			}));

		if (values.length === 0) {
			return [];
		}

		return [
			{
				id: group.id,
				name: group.name,
				values,
			},
		];
	});
}

/**
 * @param {Array<{ discountChance: number }>} lineItems
 * @param {number} itemsAmountMinor
 * @returns {number}
 */
function resolveDiscountMinor(lineItems, itemsAmountMinor) {
	const mostDiscountedChance = lineItems.reduce(
		(maxChance, item) => Math.max(maxChance, item.discountChance ?? 0),
		0,
	);

	if (
		mostDiscountedChance <= 0 ||
		faker.number.float() >= mostDiscountedChance
	) {
		return 0;
	}

	const discountRatio = faker.number.float({ min: 0.12, max: 0.28 });
	return roundMinor(itemsAmountMinor * discountRatio);
}

/**
 * @param {string} itemName
 * @returns {number}
 */
function resolveQuantity(itemName) {
	const lowerName = itemName.toLowerCase();
	if (
		lowerName.includes('soda') ||
		lowerName.includes('pudding') ||
		lowerName.includes('pack') ||
		lowerName.includes('tabs')
	) {
		return pickWeighted([
			{ value: 1, weight: 68 },
			{ value: 2, weight: 24 },
			{ value: 3, weight: 8 },
		]);
	}

	return pickWeighted([
		{ value: 1, weight: 83 },
		{ value: 2, weight: 15 },
		{ value: 3, weight: 2 },
	]);
}

/**
 * @param {number} value
 * @returns {number}
 */
function roundMinor(value) {
	return Math.max(0, Math.round(value / 5) * 5);
}

/**
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
function randomBetween(minimum, maximum) {
	return faker.number.int({ min: minimum, max: maximum });
}

/**
 * @param {number} minutes
 * @returns {number}
 */
function resolveOrderHour() {
	return pickWeighted([
		{ value: 11, weight: 7 },
		{ value: 12, weight: 12 },
		{ value: 13, weight: 10 },
		{ value: 17, weight: 8 },
		{ value: 18, weight: 16 },
		{ value: 19, weight: 20 },
		{ value: 20, weight: 15 },
		{ value: 21, weight: 8 },
		{ value: 22, weight: 4 },
	]);
}

/**
 * @param {Array<{ value: any; weight: number }>} entries
 * @returns {any}
 */
function pickWeighted(entries) {
	const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
	let cursor = faker.number.float({ min: 0, max: totalWeight });

	for (const entry of entries) {
		cursor -= entry.weight;
		if (cursor <= 0) {
			return entry.value;
		}
	}

	return entries[entries.length - 1].value;
}

/**
 * @param {any[]} items
 * @param {number} count
 * @returns {any[]}
 */
function pickDistinctItems(items, count) {
	const shuffled = faker.helpers.shuffle(items);
	return shuffled.slice(0, Math.min(count, items.length));
}

/**
 * @param {Date | string | undefined} input
 * @returns {Date}
 */
function normalizeEndDate(input) {
	if (!input) {
		const date = new Date(`${DEFAULT_DEMO_END_DATE}T17:00:00Z`);
		date.setUTCHours(17, 0, 0, 0);
		return date;
	}

	const parsed =
		input instanceof Date ? new Date(input) : new Date(String(input));
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid end date: ${String(input)}`);
	}
	parsed.setUTCHours(17, 0, 0, 0);
	return parsed;
}

/**
 * @param {Date} date
 * @param {number} days
 * @returns {Date}
 */
function addDays(date, days) {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + days);
	return next;
}

/**
 * @param {Date} date
 * @param {number} minutes
 * @returns {Date}
 */
function addMinutes(date, minutes) {
	const next = new Date(date);
	next.setUTCMinutes(next.getUTCMinutes() + minutes);
	return next;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toWoltDateTime(date) {
	const day = String(date.getUTCDate()).padStart(2, '0');
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const year = String(date.getUTCFullYear());
	const hour = String(date.getUTCHours()).padStart(2, '0');
	const minute = String(date.getUTCMinutes()).padStart(2, '0');
	return `${day}/${month}/${year}, ${hour}:${minute}`;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function toDateOnly(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * @param {Date} date
 * @returns {string}
 */
function stampForFileName(date) {
	return date
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\..+$/, '')
		.replace('T', '-');
}

/**
 * @param {string} id
 * @param {string} name
 * @param {string} city
 * @param {string} productLine
 * @param {number} visitWeight
 * @param {any[]} items
 * @returns {any}
 */
function createVenue(id, name, city, productLine, visitWeight, items) {
	return { city, id, items, name, productLine, visitWeight };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {number} startingPriceMinor
 * @param {number} priceTrendMinor
 * @param {number} discountChance
 * @param {any[]} [optionGroups]
 * @returns {any}
 */
function createItem(
	id,
	name,
	startingPriceMinor,
	priceTrendMinor,
	discountChance,
	optionGroups = [],
) {
	return {
		discountChance,
		id,
		name,
		optionGroups,
		priceTrendMinor,
		startingPriceMinor,
	};
}

/**
 * @param {string} name
 * @param {Array<{ chance: number; id: string; name: string; priceMinor: number }>} values
 * @returns {any}
 */
function createOptionGroup(name, values) {
	return { id: slugify(name), name, values };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {number} priceMinor
 * @param {number} chance
 * @returns {any}
 */
function createOption(id, name, priceMinor, chance) {
	return { chance, id, name, priceMinor };
}
