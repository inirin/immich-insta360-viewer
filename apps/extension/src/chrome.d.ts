declare namespace chrome {
  namespace contextMenus {
    type ContextType = 'page' | 'video' | 'image' | 'link';

    interface CreateProperties {
      id: string;
      title: string;
      contexts: ContextType[];
    }

    interface OnClickData {}

    function create(createProperties: CreateProperties): void;

    const onClicked: {
      addListener(callback: (info: OnClickData, tab?: tabs.Tab) => void | Promise<void>): void;
    };
  }

  namespace runtime {
    const onInstalled: {
      addListener(callback: () => void): void;
    };

    function getURL(path: string): string;
  }

  namespace storage {
    const sync: {
      get(defaults: Record<string, unknown>): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  }

  namespace tabs {
    interface Tab {
      url?: string;
    }

    function create(createProperties: { url: string }): Promise<Tab>;
  }
}
