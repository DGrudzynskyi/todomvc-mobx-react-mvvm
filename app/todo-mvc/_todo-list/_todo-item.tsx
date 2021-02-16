import { ITodoItem, TodoStatus } from "../todos.dao"
import * as React from 'react';
import { connectTodosVM } from "../todo-mvc.vm";

interface IContextProps {
    toggleStatus: () => void;
    removeTodo: () => void;
}

const TodoItemDisconnected = (props: IContextProps & ITodoItem) => {
    const className = props.status === TodoStatus.Completed ? 'completed' : '';
    return <li className={className}>
        <div className="view">
            <input className="toggle" type="checkbox" onChange={props.toggleStatus} checked={props.status === TodoStatus.Completed} />
            <label>{props.name}</label>
            <button className="destroy" onClick={props.removeTodo} />
        </div>
    </li>
}

const TodoItem = connectTodosVM(TodoItemDisconnected, (vm, ownProps: ITodoItem) => {
    return {
        toggleStatus: () => vm.toggleStatus(ownProps.id),
        removeTodo: () => vm.removeTodo(ownProps.id),
    }
});

export { TodoItem };
