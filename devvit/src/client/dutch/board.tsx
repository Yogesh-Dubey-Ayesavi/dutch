import { createContext, useContext } from 'react';

/** One design pixel on screen: the board is laid out on the design's 390 × 844 frame and scales to fit the view. */
export const BoardScale = createContext(1);
export const useK = () => useContext(BoardScale);
