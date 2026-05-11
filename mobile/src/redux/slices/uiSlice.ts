import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface UIState {
  darkMode: boolean;
  toasts: Toast[];
  modalOpen: boolean;
  modalContent: any;
  loading: boolean;
}

const initialState: UIState = {
  darkMode: false,
  toasts: [],
  modalOpen: false,
  modalContent: null,
  loading: false
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleDarkMode: (state) => {
      state.darkMode = !state.darkMode;
    },
    setDarkMode: (state, action: PayloadAction<boolean>) => {
      state.darkMode = action.payload;
    },
    addToast: (state, action: PayloadAction<Toast>) => {
      state.toasts.push(action.payload);
      if (action.payload.duration) {
        setTimeout(() => {
          uiSlice.caseReducers.removeToast(state, { payload: action.payload.id, type: 'removeToast' });
        }, action.payload.duration);
      }
    },
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
    showModal: (state, action: PayloadAction<any>) => {
      state.modalOpen = true;
      state.modalContent = action.payload;
    },
    closeModal: (state) => {
      state.modalOpen = false;
      state.modalContent = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    }
  }
});

export const {
  toggleDarkMode,
  setDarkMode,
  addToast,
  removeToast,
  showModal,
  closeModal,
  setLoading
} = uiSlice.actions;

export default uiSlice.reducer;
