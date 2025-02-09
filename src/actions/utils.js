import {
	setError,
	setLoading,
	setSuggestionsSearchId,
	setSearchId,
	setAppliedSettings,
	setPromotedResults,
	setRawData,
	setCustomData,
	setTimestamp,
} from './misc';

import { updateHits, updateAggs, updateCompositeAggs, saveQueryToHits } from './hits';
import { getInternalComponentID } from '../../lib/utils/transform';

export const handleTransformResponse = (res = null, config = {}, component = '') => {
	if (config.transformResponse && typeof config.transformResponse === 'function') {
		return config.transformResponse(res, component);
	}
	return new Promise(resolve => resolve(res));
};

// Checks if a component is active or not at a particular time
export const isComponentActive = (getState = () => {}, componentId = '') => {
	const { components } = getState();
	if (components.includes(componentId)) {
		return true;
	}
	return false;
};

export const getQuerySuggestionsId = (componentId = '') => `${componentId}__suggestions`;

export const handleError = (
	{ orderOfQueries = [], error = null } = {},
	getState = () => {},
	dispatch,
) => {
	const { queryListener } = getState();
	try {
		console.error(JSON.stringify(error));
	} catch (e) {
		console.error(error);
	}

	orderOfQueries.forEach((component) => {
		if (isComponentActive(getState, component)) { // Only update state for active components
			if (queryListener[component] && queryListener[component].onError) {
				queryListener[component].onError(error);
			}
			dispatch(setError(component, error));
			dispatch(setLoading(component, false));
		}
	});
};

export const handleResponse = (
	{
		res,
		orderOfQueries = [],
		appendToHits = false,
		appendToAggs = false,
		isSuggestionsQuery = false,
	} = {},
	getState = () => {},
	dispatch,
) => {
	const { config, internalValues } = getState();
	const searchId = res._headers ? res._headers.get('X-Search-Id') : null;
	if (searchId) {
		if (isSuggestionsQuery) {
			// set suggestions search id for internal request of search components
			dispatch(setSuggestionsSearchId(searchId));
		} else {
			// if search id was updated set it in store
			dispatch(setSearchId(searchId));
		}
	}

	// handle promoted results
	orderOfQueries.forEach((component) => {
		// Only update state for active components
		if (isComponentActive(getState, component)) {
			// Update applied settings
			if (res.settings) {
				dispatch(setAppliedSettings(res.settings, component));
			}
			handleTransformResponse(res[component], config, component)
				.then((response) => {
					if (response) {
						const { timestamp } = getState();
						if (
							timestamp[component] === undefined
							|| timestamp[component] < res._timestamp
						) {
							const promotedResults = response.promoted;
							if (promotedResults) {
								const parsedPromotedResults = promotedResults.map(promoted => ({
									...promoted.doc,
									_position: promoted.position,
								}));
								dispatch(setPromotedResults(parsedPromotedResults, component));
							} else {
								dispatch(setPromotedResults([], component));
							}
							// set raw response in rawData
							dispatch(setRawData(component, response));
							// Update custom data
							dispatch(setCustomData(response.customData, component));
							if (response.hits) {
								dispatch(setTimestamp(component, res._timestamp));
								dispatch(updateHits(
									component,
									response.hits,
									response.took,
									response.hits && response.hits.hidden,
									appendToHits,
								));
								// get query value
								const internalComponentID = getInternalComponentID(component);
								// Store the last query value associated with `hits`
								if (internalValues[internalComponentID]) {
									dispatch(saveQueryToHits(
										component,
										internalValues[internalComponentID].value,
									));
								}
							}

							if (response.aggregations) {
								dispatch(updateAggs(component, response.aggregations, appendToAggs));
								dispatch(updateCompositeAggs(
									component,
									response.aggregations,
									appendToAggs,
								));
							}
						}
						dispatch(setLoading(component, false));
					}
				})
				.catch((err) => {
					handleError(
						{
							orderOfQueries,
							error: err,
						},
						getState,
						dispatch,
					);
				});
		}
		// }
	});
};

export const handleResponseMSearch = (
	{
		res = {},
		isSuggestionsQuery = false,
		orderOfQueries = [],
		appendToHits = false,
		appendToAggs = false,
	},
	getState = () => {},
	dispatch,
) => {
	// handle promoted results
	orderOfQueries.forEach((component, index) => {
		// If response is stale then don't process response
		if (isComponentActive(getState, component)) { // Only update state for active components
			const searchId = res._headers ? res._headers.get('X-Search-Id') : null;
			if (searchId) {
				if (isSuggestionsQuery) {
					// set suggestions search id for internal request of search components
					dispatch(setSuggestionsSearchId(searchId));
				} else {
					// if search id was updated set it in store
					dispatch(setSearchId(searchId));
				}
			}
			let transformResponse = res;
			if (res && Array.isArray(res.responses) && res.responses[index]) {
				transformResponse = res.responses[index];
			}
			const { config, internalValues } = getState();
			handleTransformResponse(transformResponse, config, component)
				.then((response) => {
					const { timestamp } = getState();
					if (
						timestamp[component] === undefined
						|| timestamp[component] < res._timestamp
					) {
						// set raw response in rawData
						dispatch(setRawData(component, response));
						const promotedResults = response.promoted || res.promoted;
						if (promotedResults) {
							dispatch(setPromotedResults(promotedResults, component));
						} else {
							dispatch(setPromotedResults([], component));
						}
						if (response.hits) {
							dispatch(setTimestamp(component, res._timestamp));
							dispatch(updateHits(
								component,
								response.hits,
								response.took,
								response.hits && response.hits.hidden,
								appendToHits,
							));
							// get query value
							const internalComponentID = getInternalComponentID(component);
							// Store the last query value associated with `hits`
							if (internalValues[internalComponentID]) {
								dispatch(saveQueryToHits(
									component,
									internalValues[internalComponentID].value,
								));
							}
						}

						if (response.aggregations) {
							dispatch(updateAggs(component, response.aggregations, appendToAggs));
							dispatch(updateCompositeAggs(component, response.aggregations, appendToAggs));
						}
					}
					dispatch(setLoading(component, false));
				})
				.catch((err) => {
					handleError(
						{
							orderOfQueries,
							error: err,
						},
						getState,
						dispatch,
					);
				});
		}
	});
};

export const isPropertyDefined = property => property !== undefined && property !== null;

export const getSuggestionQuery = (getState = () => {}, componentId) => {
	const { internalValues } = getState();
	const internalValue = internalValues[componentId];
	const value = (internalValue && internalValue.value) || '';
	return [
		{
			id: getQuerySuggestionsId(componentId),
			dataField: ['key', 'key.autosuggest'],
			size: 5,
			value,
			defaultQuery: {
				query: {
					bool: {
						minimum_should_match: 1,
						should: [
							{
								function_score: {
									field_value_factor: {
										field: 'count',
										modifier: 'sqrt',
										missing: 1,
									},
								},
							},
							{
								multi_match: {
									fields: ['key^9', 'key.autosuggest^1', 'key.keyword^10'],
									fuzziness: 0,
									operator: 'or',
									query: value,
									type: 'best_fields',
								},
							},
							{
								multi_match: {
									fields: ['key^9', 'key.autosuggest^1', 'key.keyword^10'],
									operator: 'or',
									query: value,
									type: 'phrase',
								},
							},
							{
								multi_match: {
									fields: ['key^9'],
									operator: 'or',
									query: value,
									type: 'phrase_prefix',
								},
							},
						],
					},
				},
			},
		},
	];
};

export function executeQueryListener(listener, oldQuery, newQuery) {
	if (listener && listener.onQueryChange) {
		listener.onQueryChange(oldQuery, newQuery);
	}
}
