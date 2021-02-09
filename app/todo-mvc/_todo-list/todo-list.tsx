import * as React from 'react';
import { connectTodosVM } from '../todo-mvc.vm';
import { ITodoItem, TodoStatus } from '../todos.dao';
import { TodoItem } from './_todo-item';

interface IContenxtProps {
    setStatusForAllItems: () => void;
    areAllItemsCompleted: boolean;
    visibleItems: ReadonlyArray<Readonly<ITodoItem>>
}

interface IOwnProps {
    status: TodoStatus;
}

const TodoListDisconnected = (props: IContenxtProps & IOwnProps) => (
    <section className="main">
        <input id="toggle-all" className="toggle-all" type="checkbox" onClick={props.setStatusForAllItems} />
        <label htmlFor="toggle-all">Mark all as complete</label>
        <ul className="todo-list">
            {props.visibleItems.map(x => <TodoItem key={x.id} {...x} />)}
        </ul>
    </section>
)

const TodoList = connectTodosVM<IContenxtProps, IOwnProps>(TodoListDisconnected, (vm, ownProps) => {
    const hasActiveItems = vm.getTodoItems(TodoStatus.Active).length;
    const hasCompletedItems = vm.getTodoItems(TodoStatus.Completed).length;

    const areAllItemsCompleted = hasCompletedItems && !hasActiveItems;

    return {
        setStatusForAllItems: () => vm.setAllStatus(areAllItemsCompleted ? TodoStatus.Active : TodoStatus.Completed),
        areAllItemsCompleted: areAllItemsCompleted,
        visibleItems: vm.getTodoItems(ownProps.status),
    }
});


export { TodoList };