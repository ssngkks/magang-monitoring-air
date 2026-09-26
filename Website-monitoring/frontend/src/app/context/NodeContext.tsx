import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { api, Node } from '../lib/api';
import { useAuth } from './AuthContext';
import {
  summarizeNodes,
  resolveSelectedNode,
  readStoredNodeId,
  writeStoredNodeId,
  NodesSummary,
} from '../lib/nodes';

interface NodeContextType {
  nodes: Node[];
  selectedNode: Node | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string) => void;
  summary: NodesSummary;
  alertsUnread: number;
  isLoading: boolean;
  fetchError: string | null;
  refresh: () => void;
}

const NodeContext = createContext<NodeContextType | undefined>(undefined);

const EMPTY_SUMMARY: NodesSummary = {
  total: 0,
  online: 0,
  offline: 0,
  warning: 0,
  waterQuality: { Normal: 0, Warning: 0, Bahaya: 0, Offline: 0 },
  environment: { Normal: 0, Warning: 0, Bahaya: 0, Offline: 0 },
  physical: { Normal: 0, Warning: 0, Bahaya: 0, Offline: 0 },
  tank: { Normal: 0, Warning: 0, Bahaya: 0, Offline: 0 },
};

export function NodeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [alertsUnread, setAlertsUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [storedId, setStoredId] = useState<string | null>(() => readStoredNodeId());
  const [pollTick, setPollTick] = useState(0);

  // Satu-satunya polling daftar node global (8s) — pengganti fetch /nodes per halaman.
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const { data: fetched } = await api.nodes();
        if (cancelled) return;
        setNodes(Array.isArray(fetched) ? fetched : []);
        setFetchError(null);
        try {
          const res = await api.alerts('is_read=0&per_page=1');
          if (!cancelled && Array.isArray(res.data)) setAlertsUnread(res.data.length);
        } catch {
          /* badge opsional */
        }
      } catch (err: any) {
        if (!cancelled) setFetchError(err?.message || 'Gagal memuat data node.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchAll();
    const timer = setInterval(fetchAll, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAuthenticated, pollTick]);

  const urlParam = searchParams.get('node');
  const selectedNode = useMemo(
    () => resolveSelectedNode(nodes, urlParam, storedId),
    [nodes, urlParam, storedId]
  );
  const selectedNodeId = selectedNode ? String(selectedNode.id) : null;

  const setSelectedNodeId = useCallback(
    (id: string) => {
      writeStoredNodeId(id);
      setStoredId(id);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('node', id);
        return next;
      });
    },
    [setSearchParams]
  );

  // Kunci default agar URL bisa dibagikan / refresh konsisten.
  useEffect(() => {
    if (nodes.length > 0 && !urlParam && !storedId && selectedNode) {
      writeStoredNodeId(String(selectedNode.id));
      setStoredId(String(selectedNode.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  const summary = useMemo(
    () => (nodes.length ? summarizeNodes(nodes) : EMPTY_SUMMARY),
    [nodes]
  );

  const refresh = useCallback(() => setPollTick((t) => t + 1), []);

  const value = useMemo(
    () => ({
      nodes,
      selectedNode,
      selectedNodeId,
      setSelectedNodeId,
      summary,
      alertsUnread,
      isLoading,
      fetchError,
      refresh,
    }),
    [nodes, selectedNode, selectedNodeId, setSelectedNodeId, summary, alertsUnread, isLoading, fetchError, refresh]
  );

  return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}

export function useNode(): NodeContextType {
  const ctx = useContext(NodeContext);
  if (!ctx) throw new Error('useNode harus dipakai di dalam <NodeProvider>');
  return ctx;
}
