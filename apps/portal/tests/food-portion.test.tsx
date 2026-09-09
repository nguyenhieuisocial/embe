import {expect,it,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';
import FoodPortionInput from '../src/components/food-portion-input';
import {foodPortionLabel,isBoiledChickenEgg} from '../src/lib/food-portion';
afterEach(cleanup);
it('uses count for boiled chicken eggs without applying the conversion to mixed dishes or other eggs',()=>{
 for(const name of ['Trứng luộc','trung luoc','Trứng gà luộc chín kỹ','Boiled egg'])expect(isBoiledChickenEgg(name)).toBe(true);
 for(const name of ['Trứng cút luộc','Trứng vịt luộc','Cơm với trứng luộc','Trứng chiên'])expect(isBoiledChickenEgg(name)).toBe(false);
 expect(foodPortionLabel('Trứng luộc',100)).toBe('≈ 2 quả');
});
it('converts entered eggs to grams and switches units without changing stored weight',()=>{
 const change=vi.fn();render(<FoodPortionInput name="Trứng luộc" grams={100} onChange={change}/>);
 const input=screen.getByRole('spinbutton');expect(input).toHaveValue(2);
 fireEvent.change(input,{target:{value:'1.5'}});expect(change).toHaveBeenLastCalledWith('75');
 change.mockClear();fireEvent.change(screen.getByRole('combobox'),{target:{value:'grams'}});
 expect(input).toHaveValue(100);expect(change).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:''}});expect(change).toHaveBeenLastCalledWith('');
});
it('does not invent a portion when recognition has no weight',()=>{
 render(<FoodPortionInput editing name="Trứng luộc" grams={null} onChange={()=>{}}/>);
 expect(screen.getByRole('spinbutton')).toHaveValue(null);
 expect(screen.getByText('Sửa khẩu phần (quả)')).toBeTruthy();
});
