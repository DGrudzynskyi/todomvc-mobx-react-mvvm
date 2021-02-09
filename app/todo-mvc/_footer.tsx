import { TodoStatus } from "./todos.dao"
import * as React from 'react';
import { Link } from "react-router-dom";
import { connectTodosVM } from "./todo-mvc.vm";

interface IOwnProps {
    selectedStatus?: TodoStatus;
}

interface IContextProps {
    clearCompleted: () => void;
    activeItemsCount: number;
    completedItemsCount: number;
}

const dullPluralize = (itemsNumber: number) => {
    return itemsNumber === 1 ? 'item' : 'items';
}

const FooterDisconnected = (props: IContextProps & IOwnProps) => {
    return <footer className="footer">
        <span className="todo-count"><strong>{props.activeItemsCount}</strong> {dullPluralize(props.activeItemsCount)} left</span>
        
        <ul className="filters">
            <li>
                <Link to='/' className={!props.selectedStatus ? 'selected' : ''}>All</Link>
            </li>
            <li>
                <Link to='/active' className={props.selectedStatus === TodoStatus.Active ? 'selected' : ''}>active</Link>
            </li>
            <li>
                <Link to='/completed' className={props.selectedStatus === TodoStatus.Completed ? 'selected' : ''}>completed</Link>
            </li>
        </ul>
        {props.completedItemsCount 
            ? <button className="clear-completed" onClick={props.clearCompleted}>Clear completed</button>
            : null
        }
    </footer>
}

const Footer = connectTodosVM<IContextProps, IOwnProps>(FooterDisconnected, vm => {
    return {
        clearCompleted: vm.removeCompletedTodos,
        activeItemsCount: vm.getTodoItems(TodoStatus.Active).length,
        completedItemsCount: vm.getTodoItems(TodoStatus.Completed).length,
    }
});

export { Footer };