
<script lang="ts">
    import { connectTodosVM } from "./todo-mvc.vm";
    import { TodoStatus } from "./todos.dao";
    import { Link } from "svelte-routing";
    export let selectedStatus: TodoStatus;

    let clearCompleted: () => void;
    let activeItemsCount: number;
    let completedItemsCount: number;

    connectTodosVM(vm => {
        clearCompleted = vm.removeCompletedTodos;
        activeItemsCount = vm.getTodoItems(TodoStatus.Active).length;
        completedItemsCount = vm.getTodoItems(TodoStatus.Completed).length;
    });
    
    const dullPluralize = (itemsNumber: number) => {
        return itemsNumber === 1 ? 'item' : 'items';
    }
</script>

<footer class="footer">
    <span class="todo-count"><strong>{activeItemsCount}</strong> {dullPluralize(activeItemsCount)} left</span>
    
    <ul class="filters">
        <li>
            <Link to='/' class={!selectedStatus ? 'selected' : ''}>All</Link>
        </li>
        <li>
            <Link to='/active' class={selectedStatus === TodoStatus.Active ? 'selected' : ''}>active</Link>
        </li>
        <li>
            <Link to='/completed' class={selectedStatus === TodoStatus.Completed ? 'selected' : ''}>completed</Link>
        </li>
    </ul>
    {#if completedItemsCount > 0}
        <button class="clear-completed" on:click={clearCompleted}>Clear completed</button>
    {/if}
</footer>