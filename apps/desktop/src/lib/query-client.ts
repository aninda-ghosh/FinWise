import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,          // data is always stale
      refetchOnMount: true,  // refetch whenever a page mounts (i.e. on navigation)
      refetchOnWindowFocus: false, // don't double-fetch on alt-tab
      retry: 1,
    },
  },
});
