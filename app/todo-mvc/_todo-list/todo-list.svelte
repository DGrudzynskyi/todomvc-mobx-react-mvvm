<script lang="ts">
    import { connectTodosVM } from '../todo-mvc.vm';
    import type { ITodoItem } from '../todos.dao';
    import { TodoStatus } from '../todos.dao';
    import TodoItem from './_todo-item.svelte';

    export let status: TodoStatus;
    
    let setStatusForAllItems: () => void;
    let areAllItemsCompleted: boolean;
    let visibleItems: ReadonlyArray<Readonly<ITodoItem>>;

    connectTodosVM(vm => {
        const hasActiveItems = vm.getTodoItems(TodoStatus.Active).length;
        const hasCompletedItems = vm.getTodoItems(TodoStatus.Completed).length;

        areAllItemsCompleted = hasCompletedItems && !hasActiveItems;
        setStatusForAllItems = () => vm.setAllStatus(areAllItemsCompleted ? TodoStatus.Active : TodoStatus.Completed);
        visibleItems = vm.getTodoItems(status);  
    });
</script>


<section class="main">
    <input id="toggle-all" class="toggle-all" type="checkbox" on:click={setStatusForAllItems} />
    <label for="toggle-all">Mark all as complete</label>
    <ul class="todo-list">
        {#each visibleItems as item}
            <TodoItem {...item}/>
        {/each}
    </ul>
</section>