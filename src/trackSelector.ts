import { computeSelector, isObservable } from './helpers';
import type {
    ListenerParams,
    NodeValue,
    ObservableListenerDispose,
    ObserveEvent,
    Selector,
    TrackingNode,
} from './observableInterfaces';
import type { ObserveOptions } from './observe';
import { setupTracking } from './setupTracking';
import { beginTracking, endTracking, tracking } from './tracking';

export function trackSelector<T>(
    selector: Selector<T>,
    update: (params: ListenerParams) => void,
    observeEvent?: ObserveEvent<T>,
    observeOptions?: ObserveOptions,
    createResubscribe?: boolean,
) {
    let nodes: Map<NodeValue, TrackingNode> | undefined;
    let value;
    let dispose;
    let tracker;
    let resubscribe: ObservableListenerDispose | undefined;
    let updateFn = update;

    if (isObservable(selector)) {
        value = selector.peek();
        dispose = selector.onChange(update);
        resubscribe = createResubscribe ? selector.onChange(update) : undefined;
    } else {
        // Compute the selector inside a tracking context
        beginTracking();
        value = selector ? computeSelector(selector, observeEvent, observeOptions?.fromComputed) : selector;
        tracker = tracking.current;
        nodes = tracker!.nodes;
        endTracking();

        if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && tracker && nodes) {
            tracker.traceListeners?.(nodes);
            if (tracker.traceUpdates) {
                updateFn = tracker.traceUpdates(update) as () => void;
            }
            // Clear tracing so it doesn't leak to other components
            tracker.traceListeners = undefined;
            tracker.traceUpdates = undefined;
        }
    }

    if (!observeEvent?.cancel) {
        // Do tracing if it was requested

        // useSyncExternalStore doesn't subscribe until after the component mount.
        // We want to subscribe immediately so we don't miss any updates
        dispose = setupTracking(nodes, updateFn, false, observeOptions?.immediate);
        resubscribe = createResubscribe ? () => setupTracking(nodes, updateFn) : undefined;
    }

    return { value, dispose, resubscribe };
}
