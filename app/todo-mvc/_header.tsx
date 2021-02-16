import * as React from 'react';
import { connectTodosVM } from './todo-mvc.vm';

interface IProps {
    createTodo: (name: string) => void;
}

const HeaderDisconnected = (props: IProps) => {
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        e.currentTarget.value = '';
    }

    const handleClick = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if(e.key === 'Enter') {
            const value = e.currentTarget.value;
            e.currentTarget.value = '';
            props.createTodo(value);
        }
        if(e.key === 'Escape') {
            e.currentTarget.value = '';
        }
    }

    return (
        <header className="header">
            <h1>todos</h1>
            <input 
                className="new-todo" 
                placeholder="What needs to be done?" 
                autoFocus 
                onKeyDown={handleClick} 
                onBlur={handleBlur} 
            />
        </header>
    )
}

const Header = connectTodosVM(HeaderDisconnected, vm => {
    return {
        createTodo: vm.createTodo,
    }
});

export { Header };