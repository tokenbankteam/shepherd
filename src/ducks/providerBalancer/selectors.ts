import { RootState } from '@src/ducks';
import { Omit } from '@src/types';
import {
  ProviderCall,
  getPendingProviderCallsByProviderId,
} from '@src/ducks/providerBalancer/providerCalls';
import {
  getProviderStats,
  ProviderStatsState,
} from '@src/ducks/providerBalancer/providerStats';
import RpcProvider from '@src/providers/rpc';

export const getProviderBalancer = (state: RootState) => state.providerBalancer;

export type AvailableProviders = {
  [providerId in keyof ProviderStatsState]: Omit<
    ProviderStatsState[providerId],
    'isOffline'
  > & {
    isOffline: false;
  }
};

/**
 * @description an available provider === it being online
 * @param state
 */
export const getAvailableProviders = (state: RootState): AvailableProviders => {
  const providers = getProviderStats(state);
  const initialState: AvailableProviders = {};

  const isAvailable = (
    provider: ProviderStatsState[string],
  ): provider is AvailableProviders[string] => !provider.isOffline;

  return Object.entries(providers).reduce(
    (accu, [curProviderId, curProvider]) => {
      if (isAvailable(curProvider)) {
        return { ...accu, [curProviderId]: curProvider };
      }
      return accu;
    },
    initialState,
  );
};

export const getAllMethodsAvailable = (state: RootState): boolean => {
  const allMethods: (keyof RpcProvider)[] = [
    'ping',
    'sendCallRequest',
    'getBalance',
    'estimateGas',
    'getTransactionCount',
    'getCurrentBlock',
    'sendRawTx',
  ];

  const availableProviders = getAvailableProviders(state);

  // goes through each available provider and reduces all of their
  // available methods into a mapping that contains all supported methods
  const availableMethods = Object.values(availableProviders).reduce<{
    [availableMethod: string]: boolean;
  }>(
    (methods, { supportedMethods }) => ({
      ...methods,
      ...Object.entries(supportedMethods).reduce(
        // creates a mapping of all supported methods, excluding unsupported ones
        (accu, [rpcMethod, isSupported]) => ({
          ...accu,
          ...(isSupported ? { [rpcMethod]: true } : {}),
        }),
        {},
      ),
    }),
    {},
  );

  return allMethods.reduce(
    (allAvailable, curMethod) => allAvailable && availableMethods[curMethod],
    true,
  );
};

// available providers -> providers that support the method -> providers that are whitelisted -> prioritized providers -> workers not busy
// TODO: include response time in prioritization
export const getAvailableProviderId = (
  state: RootState,
  payload: ProviderCall,
) => {
  const { providerWhiteList, rpcMethod, minPriorityProviderList } = payload;
  const availableProviders = getAvailableProviders(state);

  const availableProvidersArr = Object.entries(availableProviders);
  // filter by providers that can support this method
  const supportsMethod = availableProvidersArr.filter(
    ([_, stats]) => stats.supportedMethods[rpcMethod],
  );

  // filter providers that are in the whitelist
  const isWhitelisted = providerWhiteList
    ? supportsMethod.filter(([providerId]) =>
        providerWhiteList.includes(providerId),
      )
    : supportsMethod;

  // grab the providers that are not included in min priority
  const prioritized1 = isWhitelisted.filter(
    ([providerId]) => !minPriorityProviderList.includes(providerId),
  );

  // grab the providers that are included
  const prioritized2 = isWhitelisted.filter(([providerId]) =>
    minPriorityProviderList.includes(providerId),
  );

  // prioritize the list by using providers with most workers free
  const listToPrioritizeByWorker =
    prioritized1.length > 0 ? prioritized1 : prioritized2;

  let prevProvider: {
    providerId: string;
    numOfRequestsCurrentProcessing: number;
  } | null = null;

  for (const [currentProviderId] of listToPrioritizeByWorker) {
    const numOfRequestsCurrentProcessing = getPendingProviderCallsByProviderId(
      state,
      currentProviderId,
    );

    // if there's no selected provider yet (aka first iteration)
    // or
    // the current provider has less requests processing, switch the next provider to current provider
    if (
      !prevProvider ||
      prevProvider.numOfRequestsCurrentProcessing >
        numOfRequestsCurrentProcessing
    ) {
      prevProvider = {
        providerId: currentProviderId,
        numOfRequestsCurrentProcessing,
      };
    }
  }

  return prevProvider ? prevProvider.providerId : null;
};