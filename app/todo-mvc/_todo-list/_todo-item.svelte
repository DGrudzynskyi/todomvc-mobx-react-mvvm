<script lang="ts">
    import { connectTodosVM } from "../todo-mvc.vm";
    import { TodoStatus } from "../todos.dao"

    export let name: string;
    export let id: number;
    export let status: TodoStatus;

    let toggleStatus: () => void;
    let removeTodo: () => void;

    connectTodosVM(vm => {
        toggleStatus = () => vm.toggleStatus(id);
        removeTodo = () => vm.removeTodo(id);
    });
</script>

<li class={status === TodoStatus.Completed ? 'completed' : ''}>
    <div class="view">
        <input class="toggle" type="checkbox" on:change={toggleStatus} checked={status === TodoStatus.Completed} />
        <label>{name}</label>
        <button class="destroy" on:click={removeTodo} />
    </div>
</li>