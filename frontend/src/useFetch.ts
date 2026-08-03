import { useEffect, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Small loader shared by the browse pages so each one does not re-implement
 * loading/error state.
 *
 * `fetcher` must be a stable reference — pass an `api` method directly
 * (`useFetch(api.company, id)`), not an inline arrow. The methods on `api` are
 * created once at module load, so they can be honest dependencies of the
 * effect; an inline arrow would be a new value each render and refetch forever.
 *
 * `key` is the argument handed to the fetcher, and re-running is keyed on it.
 */
export function useFetch<T>(
  fetcher: (key: string) => Promise<T>,
  key: string
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    // Guards against a slow request resolving after the user has navigated on,
    // which would show the wrong record.
    let active = true;
    setState({ data: null, error: null, loading: true });

    fetcher(key)
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            data: null,
            error: err instanceof Error ? err.message : "Something went wrong",
            loading: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [fetcher, key]);

  return state;
}
