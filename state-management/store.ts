import { createStore, combineReducers } from 'redux';

interface StoreState {
  username: string;
}

const initialState: StoreState = {
  username: '',
};

const reducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'UPDATE_USERNAME':
      return { ...state, username: action.payload };
    default:
      return state;
  }
};

const store = createStore(combineReducers({ reducer }));

export default store;